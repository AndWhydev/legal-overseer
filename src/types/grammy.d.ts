declare module 'grammy' {
  interface Update {
    update_id: number
    message?: Record<string, unknown>
    callback_query?: Record<string, unknown>
    [key: string]: unknown
  }

  interface ChatInfo {
    id: number
    type: string
    title?: string
    first_name?: string
  }

  interface UserInfo {
    id: number
    is_bot: boolean
    first_name: string
    username?: string
  }

  interface MessageInfo {
    message_id: number
    text?: string
    chat: ChatInfo
    from?: UserInfo
    [key: string]: unknown
  }

  interface CallbackQueryInfo {
    id: string
    data?: string
    message?: MessageInfo
    from: UserInfo
  }

  interface Context {
    update: Update
    message?: MessageInfo
    chat?: ChatInfo
    from?: UserInfo
    callbackQuery?: CallbackQueryInfo
    reply(text: string, options?: Record<string, unknown>): Promise<MessageInfo>
    answerCallbackQuery(options?: string | Record<string, unknown>): Promise<boolean>
    editMessageText(text: string, options?: Record<string, unknown>): Promise<MessageInfo | boolean>
    editMessageReplyMarkup(options?: Record<string, unknown>): Promise<MessageInfo | boolean>
  }

  type Middleware = (ctx: Context, next: () => Promise<void>) => Promise<void> | void
  type CommandHandler = (ctx: Context) => Promise<void> | void

  class Bot {
    constructor(token: string)
    botInfo: UserInfo
    command(command: string, handler: CommandHandler): void
    on(event: string, handler: Middleware): void
    callbackQuery(trigger: string | RegExp, handler: CommandHandler): void
    catch(handler: (err: unknown, ctx: Context) => void): void
    init(): Promise<void>
    start(): void
    stop(): void
    handleUpdate(update: Update): Promise<void>
    api: {
      sendMessage(chatId: number, text: string, options?: Record<string, unknown>): Promise<MessageInfo>
    }
  }

  class InlineKeyboard {
    text(text: string, data: string): InlineKeyboard
    row(): InlineKeyboard
  }

  export { Bot, Context, InlineKeyboard, Middleware, CommandHandler, Update, MessageInfo, UserInfo, ChatInfo, CallbackQueryInfo }
}
