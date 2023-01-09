
import { format, createLogger, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
const SERVICE_NAME = "rtpoll-api"
const { timestamp, combine, printf, colorize } = format;
// const levels = {
//     error: 0,
//     warn: 1,
//     info: 2,
//     http: 3,
//     verbose: 4,
//     debug: 5,
//     silly: 6
// };
const dailyRotateOptions = {
    dirname: './log',
    filename: `${SERVICE_NAME}-%DATE%`,
    extention: '.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '365d'
};

function buildDevLogger(logLevel?: string) {
    const localLogFormat = printf(({ level, message, timestamp, stack }: any) => {

        return `${timestamp} ${level} ${stack || message}`;
    })

    return createLogger({
        level: logLevel,
        format: combine(colorize(), timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), format.errors({ stack: true }), localLogFormat),
        defaultMeta: SERVICE_NAME,
        transports: [new transports.Console()]
    });
}


function buildProdLogger(logLevel?: string) {

    return createLogger({
        level: logLevel,
        format: combine(timestamp(), format.errors({ stack: true }), format.json()),
        defaultMeta: { service: SERVICE_NAME },
        transports: [new DailyRotateFile(dailyRotateOptions)]
    });
}

function logger() {

    if (process.env.NODE_ENV === 'development') {
        return buildDevLogger(process.env.LOG_LEVEL);
    } else {
        // return buildProdLogger(process.env.LOG_LEVEL);
        return buildDevLogger(process.env.LOG_LEVEL);
    }

}

export default logger();
