/**
 * 云服务公共配置。
 * 这两个值来自 workbuddy_cloud_service 激活时返回的 publicConfig，
 * 是前端代码里唯一允许出现的云端配置（publishableKey 只标识应用、本身不带权限，
 * 服务端对 Origin 做精确匹配）。
 */
export const CLOUD_ENDPOINT = 'https://novel-studio-15510.app.workbuddy.host'
export const CLOUD_PUBLISHABLE_KEY =
  'wbpk_K8QSy5hZUVWEIJZl9QA1Oj_DayZz01Wht2vD3XJFceoOjKwj9C5MMU2'
