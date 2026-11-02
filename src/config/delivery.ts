/**
 * Куда автоматически отправлять ответы.
 * Если токен пустой — автоотправка выключена, и на странице итогов
 * остаются только кнопки скачивания (данные передаются вручную).
 *
 * Токен виден в коде страницы. Если бот начнут спамить —
 * перевыпустите токен в @BotFather (/mybots → API Token → Revoke) и обновите здесь.
 */
export const DELIVERY = {
  telegramBotToken: '8830075596:AAE80BpbGd4_C_ovFBh4XRRD3-LN7Cyc6Tc',
  telegramChatId: '173197598',
  /** Адрес опубликованного брифа — в сообщении будет ссылка на режим просмотра */
  publicUrl: 'https://elokrua-ctrl.github.io/sibpromtech-brief/',
  /** Черновик: не чаще, чем раз в N минут, и не раньше, чем после N ответов */
  draftMinIntervalMin: 10,
  draftMinAnswers: 3,
};

export const deliveryEnabled = (): boolean => !!DELIVERY.telegramBotToken && !!DELIVERY.telegramChatId;
