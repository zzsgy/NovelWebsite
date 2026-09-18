import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'
import { CLOUD_ENDPOINT, CLOUD_PUBLISHABLE_KEY } from './cloud.config'

/** 全局唯一的云服务客户端：认证 / 数据库 / 存储共用这一个实例 */
export const cloud = createWorkBuddyCloud({
  endpoint: CLOUD_ENDPOINT,
  publishableKey: CLOUD_PUBLISHABLE_KEY,
})

/**
 * 云服务只在应用的发布域名下可用（服务端对 Origin 做精确匹配，
 * localhost 与预览环境一律回退到浏览器本地存储，方便本地开发）。
 */
export const cloudEnabled = (() => {
  try {
    return location.origin === new URL(CLOUD_ENDPOINT).origin
  } catch {
    return false
  }
})()
