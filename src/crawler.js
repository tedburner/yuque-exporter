const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const COS = require('cos-nodejs-sdk-v5'); // 引入腾讯云 SDK
const config = require('./config');
const utils = require('./utils');
const colors = require('colors');

class YuqueCrawler {
    constructor(options = {}) {
        this.browser = null;
        this.page = null;
        this.onProgress = options.onProgress || (() => {});
        this.onLog = options.onLog || console.log;
        
        // 初始化腾讯云 COS 客户端
        this.cos = new COS({
            SecretId: config.cos.SecretId,
            SecretKey: config.cos.SecretKey
        });
    }

    async init() {
        this.onLog('正在启动浏览器...'.cyan);
        this.browser = await puppeteer.launch({
            headless: "new",
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                `--window-size=${config.windowSize}`
            ],
            defaultViewport: null
        });

        this.page = await this.browser.newPage();
        await this.page.setUserAgent(config.userAgent);

        if (config.cookie) {
            this.onLog('注入 Cookie...'.green);
            const cookies = config.cookie.split(';').map(pair => {
                const [name, ...value] = pair.trim().split('=');
                return { name: name.trim(), value: value.join('=').trim(), domain: '.yuque.com' };
            });
            await this.page.setCookie(...cookies);
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.onLog('浏览器已关闭'.cyan);
        }
    }

    async fetchBookInfo() {
        this.onLog(`正在访问目标页面获取知识库信息: ${config.targetUrl}`.blue);
        await this.page.goto(config.targetUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await utils.sleep(3000);

        const bookData = await this.page.evaluate(() => {
            if (window.appData && window.appData.book) {
                return window.appData.book;
            }
            return null;
        });

        if (!bookData) {
            throw new Error('无法获取知识库信息，请检查 URL 或 Cookie。');
        }

        return bookData;
    }

    async fetchMarkdownApi(bookId, slug) {
        const apiUrl = `https://www.yuque.com/api/docs/${slug}?book_id=${bookId}&merge_dynamic_data=false&mode=markdown`;
        const headers = { 'User-Agent': config.userAgent };
        if (config.cookie) { headers['Cookie'] = config.cookie; }

        for (let i = 0; i < config.retry; i++) {
            try {
                const response = await axios.get(apiUrl, { headers, timeout: config.timeout });
                if (response.data && response.data.data) {
                    return response.data.data.sourcecode || '';
                }
                throw new Error('API 返回数据格式异常');
            } catch (error) {
                if (i === config.retry - 1) throw error;
                await utils.sleep(config.sleepBetweenRetry);
            }
        }
    }

    /**
     * 下载图片并上传至腾讯云 COS
     */
    async uploadToCOS(imgUrl) {
        try {
            // 1. 下载图片二进制数据
            const response = await axios.get(imgUrl, {
                responseType: 'arraybuffer',
                timeout: config.timeout,
                headers: { 
                    'User-Agent': config.userAgent,
                    'Referer': 'https://www.yuque.com/' 
                }
            });

            // 2. 生成唯一文件名 (保留原始后缀或默认为 .png)
            const filename = utils.getLocalFilename(imgUrl);
            const cosPath = `yuque_images/${filename}`; // COS 中的存储路径

            // 3. 上传至 COS
            const uploadResult = await new Promise((resolve, reject) => {
                this.cos.putObject({
                    Bucket: config.cos.Bucket,
                    Region: config.cos.Region,
                    Key: cosPath,
                    Body: Buffer.from(response.data),
                    ContentType: response.headers['content-type']
                }, (err, data) => {
                    if (err) reject(err);
                    else resolve(data);
                });
            });

            // 4. 返回 COS 的访问 URL (拼接方式根据是否有自定义域名决定)
            return `https://${uploadResult.Location}`;
        } catch (e) {
            this.onLog(`图片上传 COS 失败: ${imgUrl} -> ${e.message}`.yellow);
            return null;
        }
    }

    async processDocument(bookId, slug, savePath) {
        let markdownContent = '';
        try {
            const sourceCode = await this.fetchMarkdownApi(bookId, slug);
            markdownContent = sourceCode;
            if (!markdownContent) return false;
        } catch (e) {
            return false;
        }

        const mdImgRegex = /!\[([^\]]*)\]\((https?[^)]+)\)/g;
        const htmlImgRegex = /<img[^>]*?src=["'](https?[^"']+)["']/g;
        
        const imageUrls = new Set();
        let match;
        while ((match = mdImgRegex.exec(markdownContent)) !== null) imageUrls.add(match[2]);
        while ((match = htmlImgRegex.exec(markdownContent)) !== null) imageUrls.add(match[1]);

        // 替换为腾讯云 URL
        for (const imgUrl of imageUrls) {
            const cosUrl = await this.uploadToCOS(imgUrl);
            if (cosUrl) {
                const escapedUrl = imgUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const replaceRegex = new RegExp(escapedUrl, 'g');
                markdownContent = markdownContent.replace(replaceRegex, cosUrl);
            }
        }

        const mdDir = path.dirname(savePath);
        utils.ensureDir(mdDir);
        fs.writeFileSync(savePath, markdownContent, 'utf-8');
        return true;
    }

    async start() {
        const pLimit = (await import('p-limit')).default;
        const limit = pLimit(config.concurrency || 5);

        await this.init();

        try {
            const bookData = await this.fetchBookInfo();
            await this.close(); 
            this.browser = null;

            const bookId = bookData.id;
            const bookName = utils.sanitizeName(bookData.name);
            const toc = bookData.toc || [];

            this.onLog(`成功识别知识库: [${bookName}]`.green.bold);
            const bookRootDir = path.join(config.outputRoot, bookName);
            utils.ensureDir(bookRootDir);

            const nodeMap = {};
            toc.forEach(item => { nodeMap[item.uuid] = { ...item }; });

            const getPath = (uuid) => {
                const node = nodeMap[uuid];
                if (!node) return '';
                const safeTitle = utils.sanitizeName(node.title);
                if (!node.parent_uuid) return safeTitle;
                return path.join(getPath(node.parent_uuid), safeTitle);
            };

            const docItems = toc.filter(item => item.url && item.url.length > 0);
            let completedCount = 0;
            this.onProgress('start', docItems.length);

            const docStatusMap = new Map();
            const tasks = toc.map(item => limit(async () => {
                const itemPath = getPath(item.uuid);
                if (item.url && item.url.length > 0) {
                    const absFilePath = path.join(bookRootDir, `${itemPath}.md`);
                    try {
                        const saved = await this.processDocument(bookId, item.url, absFilePath);
                        docStatusMap.set(item.uuid, saved);
                    } catch (error) {
                        docStatusMap.set(item.uuid, false);
                    } finally {
                        completedCount++;
                        this.onProgress('update', completedCount, { file: item.title, status: 'Done' });
                    }
                } else {
                    utils.ensureDir(path.join(bookRootDir, itemPath));
                }
            }));

            await Promise.all(tasks);
            this.onProgress('stop');

            // 生成 SUMMARY.md
            const summaryLines = ['# Summary\n'];
            for (const item of toc) {
                const itemPath = getPath(item.uuid);
                const depth = itemPath.split(path.sep).length - 1;
                const indent = '  '.repeat(depth);
                if (item.url && docStatusMap.get(item.uuid)) {
                    const relLink = itemPath.split(path.sep).join('/') + '.md';
                    summaryLines.push(`${indent}* [${item.title}](${encodeURI(relLink)})`);
                } else {
                    summaryLines.push(`${indent}* ${item.title}`);
                }
            }
            fs.writeFileSync(path.join(bookRootDir, 'SUMMARY.md'), summaryLines.join('\n'));
            this.onLog(`任务完成，图片已上传至腾讯云 COS。`.green);

        } catch (error) {
            this.onLog(`全局错误: ${error.message}`.red);
        } finally {
            if (this.browser) await this.close();
        }
    }
}

module.exports = YuqueCrawler;