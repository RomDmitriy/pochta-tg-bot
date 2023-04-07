import { Tracking } from 'russian-post';
import { CronJob } from 'cron';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import * as fs from 'fs';
import * as track from 'ts-tracking-number';
import * as dotenv from 'dotenv';
dotenv.config();

// сохранения
let telegramUsers = new Map(
    Object.entries(JSON.parse(fs.readFileSync('telegramUsers.json')))
);

// для отслеживания посылки
const tracking = new Tracking({
    login: process.env.POCHTA_LOGIN,
    password: process.env.POCHTA_PASSWORD,
});

// Telegram бот
const tBot = new Telegraf(process.env.TELEGRAM_TOKEN);

// событие в 8 часов утра
const mainJob = new CronJob(
    '0 0 8 * * *',
    async () => {
        console.log('It\'s High Noon..');

        // текущая дата
        var now = new Date();

        const yesterday = new Date(now).setDate(now.getDate() - 1);
        for (let [key, value] of telegramUsers) {
            let message = await getTrackInfo(value);
            if (Date.parse(message.operation.operDate) >= yesterday) {
                message = formatMessage(message);
                tBot.sendMessage(key, 'Новости по посылке!' + message);
            }
        }
    },
    null,
    false,
    'UTC+3',
    null,
    false
);

mainJob.start();

// сохранение файлов
function saveTelegram() {
    fs.writeFile(
        './telegramUsers.json',
        JSON.stringify(Object.fromEntries(telegramUsers)),
        (err) => {
            if (err) {
                console.log(err);
            }
        }
    );
}

// команда start
tBot.start(ctx => {
    ctx.sendMessage(
        'Привет! Это бот для отслеживания посылки. Отправь код отслеживания и я буду каждый день в 9:00 по МСК писать текущий статус посылки, если он изменился за последние сутки.'
    );
});

// добавление нового кода
tBot.on(message(), ctx => {
    // проверка формата кода
    if (track.getTracking(ctx.message.text) === undefined) {
        ctx.telegram.sendMessage(ctx.message.chat.id, 'Неправильный формат кода.');
        return;
    }

    telegramUsers.set(ctx.message.chat.id.toString(), ctx.message.text);
    saveTelegram();

    ctx.telegram.sendMessage(ctx.message.chat.id, 'Код добавлен!');
});

// получение данных
async function getTrackInfo(trackCode) {
    let result;

    if (trackCode === undefined) throw new Error('Вас нет в списке.');

    try {
        result = await tracking.getHistory(trackCode);
    } catch (err) {
        throw new Error('Вы отслеживаете некорректный трек-номер.');
    }

    if (result.length === 1) return result[0];
    return result[result.length - 1];
}

// форматирование информации
function formatMessage(messageObj) {
    return (
        '\nТекущий статус посылки: ' +
        messageObj.operation.operType.name +
        ' - ' +
        messageObj.operation.operAttr.name +
        '\n' +
        messageObj.address.operationAddress.index +
        ', ' +
        messageObj.address.operationAddress.description +
        '\n' +
        messageObj.operation.operDate
    );
}

// запускаем бота
tBot.launch();