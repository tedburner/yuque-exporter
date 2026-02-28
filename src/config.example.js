const path = require('path');

module.exports = {
    // 目标 URL (必填)
    // 示例: 'https://www.yuque.com/your-username/your-knowledge-base'
    targetUrl: 'YOUR_TARGET_URL_HERE',
    
    // Cookie 配置（必须填入才能访问私有知识库）
    // 获取方式: F12 打开开发者工具 -> 网络(Network) -> 刷新页面 -> 找到任意请求 -> 复制请求头中的 Cookie
    cookie: 'YOUR_COOKIE_HERE', 

    // 爬虫配置
    timeout: 15000,
    retry: 3,
    sleepBetweenRetry: 2000,
    concurrency: 5, // 并发数 (过大可能导致 429 或被封)
    
    // 输出配置
    outputRoot: path.join(process.cwd(), 'download'),
    
    // 浏览器配置
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    windowSize: '1920,1080',
    // 腾讯云COS
    cos: {
        SecretId: 'SecretId',
        SecretKey: 'SecretKey',
        Bucket: 'Bucket', // 存储桶名称
        Region: 'ap-shanghai' // 存储桶地域:Region
    },
};
