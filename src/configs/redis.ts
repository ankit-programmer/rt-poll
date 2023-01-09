import redis, { RedisClientType } from 'redis';
// const redisearch = require('redis-redisearch');
// redisearch(redis);
import { crc32 } from 'crc';
import { brotliCompress, brotliDecompress, gzip, gunzip } from 'zlib';
import snappy from 'snappy';
import { createClient } from 'redis';
import logger from '../logger';
import { TemplatedApp } from 'uWebSockets.js';
import EventEmitter from 'events';
export enum compressor {
    'SNAPPY', 'GZIP', 'BROTLI'
}
const REDIS_CONNECTION_STRING = process.env.REDIS_CONNECTION_STRING;
if (!REDIS_CONNECTION_STRING) throw new Error("REDIS_CONNECTION_STRING is required");
const client = createClient({
    url: REDIS_CONNECTION_STRING
})
try {
    client.connect();

} catch (error) {
    logger.error(error);
    client.connect();
}
client.on("ready", async () => {
    logger.info("Connection Established to Redis!");
    const subscriber = client.duplicate();
    await subscriber.connect();

})


export class PubSub extends EventEmitter {
    private subList = new Set();
    private app: TemplatedApp;
    private subscriber: RedisClientType;
    constructor(app: TemplatedApp, client: RedisClientType) {
        super();
        this.app = app;
        this.subscriber = client.duplicate();
        client.on('ready', async () => {
            try {
                await this.subscriber.connect();
                this.emit('ready');
            } catch (error) {
                this.emit('error', error);
            }
        })

    }

    public async subscribe(room: string) {
        if (this.subList.has(room)) return;
        this.subList.add(room);
        await this.subscriber.subscribe(room, (message: string, channel: string) => {
            this.app.publish(room, message);
        });
    }
    public async unSubscribe(room: string, totalSub: number = this.app.numSubscribers(room)) {
        try {
            if (totalSub == 0) {
                await this.subscriber.unsubscribe(room);
                this.subList.delete(room);
            }
        } catch (error) {
            logger.error(error);
        }
    }
}

client.on("error", (error) => {
    logger.error(error)
})
async function cget(key: string, lib: compressor = compressor.SNAPPY): Promise<string | null> {
    try {
        const rawValue = await client.get(Buffer.from(key));
        if (!rawValue) {
            return null;
        }
        // Compressed data received from redis.
        const value = await decompress(Buffer.from(rawValue), lib);
        return value;

    } catch (error) {
        throw error;
    }

}

async function cset(key: string, value: string, lib: compressor = compressor.SNAPPY): Promise<boolean> {
    try {
        const buffer = await compress(value, lib);
        const status = await client.set(key, buffer);
        return true;
    } catch (error) {
        throw error;
    }
}

function compress(text: string, lib: compressor): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
        if (typeof text !== 'string') {
            return reject(new Error('Provide a valid string to compress.'));
        }
        switch (lib) {
            case compressor.SNAPPY:
                try {
                    let ctext = await snappy.compress(text);
                    return resolve(ctext);

                } catch (error) {
                    return reject(error);
                }
                break;
            case compressor.BROTLI:
                brotliCompress(text, {}, (error, ctext) => {
                    if (!error) {
                        return resolve(ctext);
                    }

                    return reject(error);
                });
                break;
            case compressor.GZIP:
                gzip(text, (error, ctext) => {
                    if (!error) {
                        return resolve(ctext);
                    }

                    return reject(error);
                })
                break;
            default:
                return reject(new Error('Provide a valid compressor.'));
                break;
        }



    })
}

function decompress(value: Buffer, lib: compressor): Promise<string> {
    return new Promise(async (resolve, reject) => {
        if (!(value instanceof Buffer)) {
            return reject(new Error('Provide a valid Buffer to decompress.'));
        }
        switch (lib) {
            case compressor.SNAPPY:
                try {
                    let string = await snappy.uncompress(value, { asBuffer: false });
                    return resolve(string as any);
                } catch (error) {
                    return reject(error);
                }
                break;
            case compressor.BROTLI:
                brotliDecompress(value, {}, (error, string) => {
                    if (!error) {
                        return resolve(string.toString());
                    }
                    return reject(error);

                })
                break;
            case compressor.GZIP:
                gunzip(value, (error, string) => {
                    if (!error) {
                        return resolve(string.toString());
                    }
                    return reject(error);

                })
                break;
            default:
                return reject(new Error('Provide a valid compressor.'));
                break;
        }
    })

}



/**
 * 
 * @param base Base Key Name
 * @param key Key you want to shard
 * @param totalElements Expected number of records to shard or store
 * @param shardSize Number of elements you want in a single shard
 * @returns 
 */
function shardKey(base: string, key: string, totalElements: number, shardSize: number) {
    // Got help from : https://redislabs.com/ebook/part-2-core-concepts/01chapter-9-reducing-memory-use/9-2-sharded-structures/9-2-1-hashes/#:~:text=To%20shard%20a%20HASH%20table,method%20of%20partitioning%20our%20data.&text=the%20shard%20ID%20that%20the%20data%20will%20be%20stored%20in.&text=a%20new%20key%20for%20a,and%20the%20HASH%20key%20HASH%20.
    let shardId;

    if (Number(key) && totalElements <= 0) {
        // Key is a number.
        shardId = Math.floor(parseInt(key, 10) / shardSize);


    } else {
        // Key is a string
        // let shards = Math.floor(2 * totalElements / shardSize);
        let shards = Math.ceil(totalElements / shardSize);

        shardId = crc32(key.toString()) % shards;

    }
    return `${base}:${shardId}`;
}

async function doesExist(key: string): Promise<boolean> {
    try {
        const result = await client.exists([key]);
        return (result) ? true : false;
    } catch (error) {
        throw error;
    }
}
const result = Object.assign(client, { doesExist, shardKey, compress, decompress, cget, cset });
export default result;