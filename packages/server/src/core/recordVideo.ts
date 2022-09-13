/******************************************************************************************
 * Repository: https://github.com/kolserdav/werift-sfu-react.git
 * File name: record.ts
 * Author: Sergey Kolmiller
 * Email: <uyem.ru@gmail.com>
 * License: MIT
 * License text: See in LICENSE file
 * Copyright: kolserdav, All rights reserved (c)
 * Create Date: Wed Aug 24 2022 14:14:09 GMT+0700 (Krasnoyarsk Standard Time)
 ******************************************************************************************/
import puppeteer from 'puppeteer';
import { CancelablePromise } from 'cancelable-promise';
import FFmpeg from 'fluent-ffmpeg';
import path from 'path';
import { PuppeteerScreenRecorder } from 'puppeteer-screen-recorder';
import { HEADLESS, VIEWPORT, APP_URL } from '../utils/constants';
import { ErrorCode, MessageType, SendMessageArgs } from '../types/interfaces';
import WS from './ws';
import DB from './db';
import { getLocale, log } from '../utils/lib';

class RecordVideo extends DB {
  public recordPages: Record<string, SendMessageArgs<MessageType.SET_RECORDING>> = {};

  public pages: Record<string, { page: puppeteer.Page; browser: puppeteer.Browser; time: number }> =
    {};

  public ws: WS;

  constructor({ ws: _ws }: { ws: WS }) {
    super();
    this.ws = _ws;
  }

  async startRecord({
    id: roomId,
    data: { userId },
  }: SendMessageArgs<MessageType.GET_RECORD>): Promise<{
    page: puppeteer.Page;
    recorder?: PuppeteerScreenRecorder;
    cancelablePromise?: CancelablePromise<string>;
    intervaToClean?: NodeJS.Timeout;
  }> {
    const browser = await puppeteer.launch({
      headless: HEADLESS,
      devtools: !HEADLESS,
      args: [
        '--allow-file-access-from-files',
        '--disable-gesture-requirement-for-media-playback',
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
      ],
    });
    const [page] = await browser.pages();
    page.on('close', () => {
      log('warn', 'Record page on close', {});
    });
    if (!this.pages[roomId]) {
      this.pages[roomId] = {
        page,
        browser,
        time: 0,
      };
    }
    await page.setViewport(VIEWPORT);
    await page.goto(`${APP_URL}/${roomId}?uid=record-${new Date().getTime()}&record=1`);
    const recorder = new PuppeteerScreenRecorder(page, {
      followNewTab: true,
      fps: 25,
      ffmpeg_Path: null,
      videoFrame: VIEWPORT,
      aspectRatio: '16:9',
    });
    const iat = new Date().getTime();
    const savePath = path.resolve(__dirname, `../../rec/${roomId}-${iat}.mp4`);
    await page.waitForSelector('video');
    await recorder.start(savePath);
    //new FFmpeg().addInput(video).addInput(audio).saveToFile(destination, './temp');
    let intervaToClean = setInterval(() => {
      /** */
    }, 10000000);
    this.videoCreate({
      data: {
        name: `${roomId}-${iat}.mp4`,
        roomId: roomId.toString(),
        time: 0,
      },
    });
    const cancelablePromise = new CancelablePromise(() => {
      let time = 0;
      intervaToClean = setInterval(() => {
        time++;
        this.pages[roomId].time = time;
        this.ws.sendMessage({
          type: MessageType.SET_RECORDING,
          id: userId,
          connId: '',
          data: {
            time,
            command: this.recordPages[roomId]?.data.command || 'stop',
          },
        });
      }, 1000);
      // new FFmpeg().addInput(video).addInput(audio).saveToFile(destination, './temp');
      page.on('console', (_message) => {
        const message = _message.text();
        console.log(message);
      });
      page.evaluate(() => {
        setInterval(() => {
          const videos = document.querySelectorAll('video');
          console.log(JSON.stringify({ length: videos.length }));
        }, 1000);
      });
    });
    return { page, recorder, cancelablePromise, intervaToClean };
  }

  private closeVideoRecord({
    cancelablePromise,
    recorder,
    interval,
    intervaToClean,
    args,
    time,
  }: {
    cancelablePromise: CancelablePromise<string>;
    recorder: PuppeteerScreenRecorder;
    interval: NodeJS.Timeout;
    intervaToClean: NodeJS.Timeout;
    args: SendMessageArgs<MessageType.GET_RECORD>;
    time: number;
  }) {
    const {
      id,
      connId,
      data: { userId },
    } = args;
    const locale = getLocale(this.ws.users[userId].locale).server;
    clearInterval(interval);
    recorder.stop();
    clearInterval(intervaToClean);
    this.ws.sendMessage({
      type: MessageType.SET_ERROR,
      id: userId,
      connId,
      data: {
        type: 'info',
        code: ErrorCode.videoRecordStop,
        message: locale.videoRecordStop,
      },
    });
    this.videoUpdateTime({ roomId: id, time });
    if (this.pages[id]) {
      log('warn', 'Record page was closed', { id });
      this.pages[id].page
        .close()
        .then(() => {
          this.pages[id].browser.close().catch((e) => {
            //
          });
          delete this.pages[id];
        })
        .catch(() => {
          delete this.pages[id];
        });
    }
    cancelablePromise.cancel();
  }

  public async handleVideoRecord(args: SendMessageArgs<MessageType.GET_RECORD>) {
    const {
      id,
      data: { command, userId },
    } = args;
    const prom = this.startRecord(args);
    this.recordPages[id] = {
      id,
      data: {
        command,
        time: 0,
      },
      connId: '',
      type: MessageType.SET_RECORDING,
    };
    let interval = setInterval(() => {
      /** */
    }, 100000000);
    prom.then(async ({ cancelablePromise, recorder, intervaToClean }) => {
      this.pages[id].page.on('close', () => {
        this.ws.sendMessage({
          type: MessageType.SET_RECORDING,
          id: userId,
          connId: '',
          data: {
            time: this.pages[id].time,
            command: 'stop',
          },
        });
        this.closeVideoRecord({
          cancelablePromise,
          recorder,
          intervaToClean,
          interval,
          time: this.pages[id].time,
          args,
        });
      });
      await new Promise((resolve) => {
        interval = setInterval(() => {
          const {
            data: { command: _command, time },
          } = this.recordPages[id];
          switch (_command) {
            case 'stop':
              this.closeVideoRecord({
                cancelablePromise,
                recorder,
                intervaToClean,
                interval,
                time,
                args,
              });
              resolve(0);
              break;
            default:
          }
        }, 1000);
      });
    });
  }
}
export default RecordVideo;
