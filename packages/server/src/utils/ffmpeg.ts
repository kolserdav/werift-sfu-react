import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { parse } from 'date-fns';
import ffmpeg from 'ffmpeg-static';
import RTC from '../core/rtc';

// eslint-disable-next-line import/first
import { createRandHash, log } from './lib';
import WS from '../core/ws';
import DB from '../core/db';
import { EXT_WEBM, RECORD_HEIGHT_DEFAULT, RECORD_WIDTH_DEFAULT } from './constants';

const isDev = process.env.FFMPEG_DEV === 'true';

if (isDev) {
  process.env.LOG_LEVEL = '0';
  process.env.NODE_ENV = 'development';
}

interface Chunk {
  index: number;
  id: string;
  start: number;
  end: number;
  video: boolean;
  audio: boolean;
  absPath: string;
  map: string;
  mapA: string;
}

interface Episode {
  start: number;
  end: number;
  map: string;
  mapA: string;
  video: boolean;
  audio: boolean;
  chunks: Chunk[];
}

class FFmpeg {
  private rtc: RTC;

  private videoSrc: string;

  private time = 0;

  private chunks: Chunk[];

  private episodes: Episode[] = [];

  private readonly mapLength = 6;

  private readonly forceOption = '-y';

  private readonly inputOption = '-i';

  private readonly filterComplexOption = '-filter_complex';

  private readonly mapOption = '-map';

  private readonly eol = ';';

  private readonly backgroundInput = '0:v';

  private backgroundImagePath = '/home/kol/Projects/werift-sfu-react/tmp/1png.png';

  private readonly vstackInputs = 'vstack=inputs=';

  // eslint-disable-next-line class-methods-use-this
  private readonly hstack = ({ inputs }: { inputs: number }) => `hstack=inputs=${inputs}`;

  private readonly amerge = ({ count }: { count: number }) => `amerge=inputs=${count}`;

  private readonly overlay = 'overlay=(W-w)/2:(H-h)/2';

  // eslint-disable-next-line class-methods-use-this
  private readonly pad = ({ x, y }: { x: number; y: number }) =>
    `format=rgba,pad=width=iw+${x}:height=ih+${y}:x=iw/2:y=ih/2:color=#00000000`;

  // eslint-disable-next-line class-methods-use-this
  private readonly concat = ({ n, v, a }: { n: number; v: number; a: number }) =>
    `concat=n=${n}:v=${v}:a=${a}`;

  // eslint-disable-next-line class-methods-use-this
  private readonly startDuration = ({ start, duration }: { start: number; duration: number }) =>
    `trim=start=${start}:duration=${duration},setpts=PTS-STARTPTS`;

  // eslint-disable-next-line class-methods-use-this
  private readonly startDurationA = ({ start, duration }: { start: number; duration: number }) =>
    `atrim=start=${start}:duration=${duration},asetpts=PTS-STARTPTS`;

  // eslint-disable-next-line class-methods-use-this
  private readonly scale = ({ w, h }: { w: number; h: number }) => `scale=w=${w}:h=${h}`;

  constructor({ rtc, videoSrc }: { rtc: RTC; videoSrc: string }) {
    this.rtc = rtc;
    this.videoSrc = videoSrc;
    const dir = fs.readdirSync(this.videoSrc);
    this.chunks = this.createVideoChunks({ dir });
  }

  private getFilterComplexArgument({
    args,
    value,
    map,
  }: {
    args: string;
    value: string;
    map: string;
  }) {
    return `${args}${value}${map}${this.eol}`;
  }

  public async createVideo() {
    const inputArgs = this.createInputArguments();
    const filterComplexArgs = this.createFilterComplexArguments();
    const args = inputArgs.concat(filterComplexArgs);
    args.push(`${this.videoSrc}${EXT_WEBM}`);
    const r = await this.runFFmpegCommand(args);
    if (isDev) {
      console.log(r);
    }
    return r;
  }

  private createVideoChunks({ dir }: { dir: string[] }): Chunk[] {
    const chunks: Omit<Chunk, 'index'>[] = [];
    dir.forEach((item) => {
      const peer = item.replace(EXT_WEBM, '').split(this.rtc.delimiter);
      const start = parseInt(peer[0], 10);
      const end = parseInt(peer[1], 10);
      const id = peer[2];
      const video = peer[3] === '1';
      const audio = peer[4] === '1';
      chunks.push({
        id,
        start,
        end,
        video,
        audio,
        absPath: path.resolve(this.videoSrc, item),
        map: '',
        mapA: '',
      });
    });
    return chunks
      .sort((a, b) => {
        if (a.start < b.start) {
          return -1;
        }
        if (a.start === b.start) {
          if (a.end < b.end) {
            return -1;
          }
        }
        return 1;
      })
      .map((item, index) => {
        const _item: Chunk = { ...item } as any;
        _item.index = index + 1;
        return _item;
      });
  }

  private createInputArguments() {
    const args: string[] = [this.forceOption, this.inputOption, this.backgroundImagePath];
    this.chunks.forEach((item) => {
      args.push(this.inputOption);
      args.push(item.absPath);
    });
    return args;
  }

  // eslint-disable-next-line class-methods-use-this
  private createMapArg(map: string | number) {
    return `[${map}]`;
  }

  private getArg({ chunk, dest }: { chunk: Chunk; dest: 'a' | 'v' }) {
    const map = dest === 'a' ? chunk.mapA : chunk.map;
    return map !== '' ? this.createMapArg(map) : this.createMapArg(`${chunk.index}:${dest}`);
  }

  // eslint-disable-next-line class-methods-use-this
  private joinFilterComplexArgs(args: string[]) {
    return `"${args.join('').replace(/;$/, '')}"`;
  }

  private createFilterComplexArguments() {
    const args: string[] = [];
    const _episodes = this.createEpisodes();
    this.episodes = _episodes.map((episode) => {
      const episodeCopy: Episode = { ...episode } as any;
      // Set start and duration
      let chunks = episode.chunks.map((chunk) => {
        const chunkCopy: Chunk = { ...chunk } as any;
        if (chunk.video && !chunkCopy.video) {
          chunkCopy.video = true;
        }
        if (chunk.audio && !chunkCopy.audio) {
          chunkCopy.audio = true;
        }
        if (chunk.start !== episode.start || chunk.end !== episode.end) {
          const start = episode.start - chunk.start;
          const duration = episode.end - start;
          if (chunk.video) {
            chunkCopy.map = createRandHash(this.mapLength);
            args.push(
              this.getFilterComplexArgument({
                args: this.createMapArg(`${chunk.index}:v`),
                value: this.startDuration({ start, duration }),
                map: this.createMapArg(chunkCopy.map),
              })
            );
          }
          if (chunk.audio) {
            chunkCopy.mapA = createRandHash(this.mapLength);
            args.push(
              this.getFilterComplexArgument({
                args: this.createMapArg(`${chunk.index}:a`),
                value: this.startDurationA({ start, duration }),
                map: this.createMapArg(chunkCopy.mapA),
              })
            );
          }
        } else {
          chunkCopy.map = '';
          chunkCopy.mapA = '';
        }
        return chunkCopy;
      });
      // Set audio channels
      const mapA = createRandHash(this.mapLength);
      let arg = '';
      let audioCount = 0;
      chunks = chunks.map((chunk) => {
        const chunkCopy = { ...chunk };
        if (chunk.audio) {
          audioCount++;
          arg += this.getArg({ chunk, dest: 'a' });
          episodeCopy.mapA = mapA;
          return chunkCopy;
        }
        return chunk;
      });
      args.push(
        this.getFilterComplexArgument({
          args: arg,
          value: this.amerge({ count: audioCount }),
          map: this.createMapArg(mapA),
        })
      );
      // Set video paddings
      chunks = chunks.map((chunk) => {
        if (chunk.video) {
          const chunkCopy = { ...chunk };
          chunkCopy.map = createRandHash(this.mapLength);
          // TODO calc x and y
          args.push(
            this.getFilterComplexArgument({
              args: this.getArg({ chunk, dest: 'v' }),
              value: this.pad({ x: 100, y: 50 }),
              map: this.createMapArg(chunkCopy.map),
            })
          );
          return chunkCopy;
        }
        return chunk;
      });
      // Set video stacks
      const { videoCount } = this.getCountVideos(episode.chunks);
      const map = createRandHash(this.mapLength);
      if (videoCount === 2 || videoCount === 3) {
        arg = '';
        chunks = chunks.map((chunk) => {
          if (chunk.video) {
            const chunkCopy = { ...chunk };
            arg += this.getArg({ chunk, dest: 'v' });
            chunkCopy.map = map;
            return chunkCopy;
          }
          return chunk;
        });
        args.push(
          this.getFilterComplexArgument({
            args: arg,
            value: this.hstack({ inputs: videoCount }),
            map: this.createMapArg(map),
          })
        );
      }
      // TODO videos.length === 4
      episodeCopy.chunks = chunks;
      return episodeCopy;
    });
    // Set overlay
    this.episodes = this.episodes.map((episode) => {
      const episdeCopy = { ...episode };
      const uMaps = this.getUniqueMaps(episode);
      const map = createRandHash(this.mapLength);
      const emptyMap = createRandHash(this.mapLength);
      const isEmpty = uMaps.length === 1 && uMaps[0] === '';
      if (isEmpty) {
        args.push(
          this.getFilterComplexArgument({
            args: this.createMapArg(`${episode.chunks[0].index}:v`),
            value: this.scale({ w: RECORD_WIDTH_DEFAULT, h: RECORD_HEIGHT_DEFAULT }),
            map: this.createMapArg(emptyMap),
          })
        );
      }
      uMaps.forEach((uMap) => {
        args.push(
          this.getFilterComplexArgument({
            args: `${this.createMapArg(this.backgroundInput)}${this.createMapArg(
              isEmpty ? emptyMap : uMap
            )}`,
            value: this.overlay,
            map: this.createMapArg(map),
          })
        );
      });
      episdeCopy.map = map;

      return episdeCopy;
    });

    // Set concat
    const concatMap = createRandHash(this.mapLength);
    const concatMapA = createRandHash(this.mapLength);
    let arg = '';
    this.episodes = this.episodes.map((episode) => {
      const episodeCopy = { ...episode };
      arg += `${this.createMapArg(episode.map)}${this.createMapArg(episode.mapA)}`;
      episodeCopy.map = concatMap;
      episodeCopy.mapA = concatMapA;
      return episodeCopy;
    });
    args.push(
      this.getFilterComplexArgument({
        args: arg,
        value: this.concat({
          n: this.episodes.length,
          v: 1,
          a: 1,
        }),
        map: `${this.createMapArg(concatMap)}${this.createMapArg(concatMapA)}`,
      })
    );
    const _args = [this.filterComplexOption, this.joinFilterComplexArgs(args)];
    return _args.concat(this.getMap());
  }

  private getUniqueMaps(episode: Episode) {
    const uMaps: string[] = [];
    episode.chunks.forEach((_item) => {
      const { map } = _item;
      if (uMaps.indexOf(map) === -1) {
        uMaps.push(map);
      }
    });
    return uMaps;
  }

  private getMap() {
    const maps: string[] = [];
    this.episodes.forEach((item) => {
      if (item.map) {
        const map = `"${this.createMapArg(item.map)}"`;
        if (maps.indexOf(map) === -1) {
          maps.push(this.mapOption);
          maps.push(map);
        }
      }
      if (item.mapA) {
        const mapA = `"${this.createMapArg(item.mapA)}"`;
        if (maps.indexOf(mapA) === -1) {
          maps.push(this.mapOption);
          maps.push(mapA);
        }
      }
    });
    return maps;
  }

  private getCountVideos(chunks: Chunk[]) {
    let videoCount = 0;
    let audioCount = 0;
    chunks.forEach((item) => {
      if (item.video) {
        videoCount++;
      }
      if (item.audio) {
        audioCount++;
      }
    });
    return {
      videoCount,
      audioCount,
    };
  }

  private createEpisodes() {
    const episodes: Episode[] = [];
    this.time = this.getVideoTime();
    let oldChunks: Chunk[] = [];
    let from: number | undefined;
    new Array(this.time).fill('').forEach((_, index) => {
      if (from === undefined) {
        from = index;
      }
      const chunks: Chunk[] = [];
      this.chunks.every((item) => {
        if (item.start > index || item.end < index) {
          return false;
        }
        if (item.start <= index && item.end > index) {
          chunks.push(item);
        }
        return true;
      });
      const isNew = oldChunks.length === 0;
      oldChunks = isNew ? chunks : oldChunks;
      if (!this.isEqual(chunks, oldChunks) || (oldChunks.length === 1 && isNew)) {
        const chunkPart: Chunk[] = oldChunks.map((item) => {
          const _item: Chunk = { ...item } as any;
          _item.map = createRandHash(this.mapLength);
          return _item;
        });

        episodes.push({
          start: from,
          end: index,
          video: false,
          audio: false,
          map: '',
          mapA: '',
          chunks: chunkPart,
        });
        from = index;
      }
      oldChunks = chunks;
    });
    return episodes.map((item, index) => {
      const _item = { ...item };
      if (!episodes[index + 1]) {
        _item.end = this.time;
      }
      return _item;
    });
  }

  private isEqual(a: any[], b: any[]) {
    let check = true;
    if (a.length !== b.length) {
      return false;
    }
    a.every((item, index) => {
      const aKeys = Object.keys(item);
      aKeys.every((_item) => {
        if (item[_item] !== b[index]?.[_item]) {
          check = false;
          return false;
        }
        return true;
      });
      return check;
    });
    return check;
  }

  private getVideoTime() {
    const min = this.chunks[0]?.start || 0;
    let max = 0;
    this.chunks.forEach((item) => {
      if (item.end > max) {
        max = item.end;
      }
    });
    return max - min;
  }

  private parseTime(data: string) {
    const time = data.match(/time=\d{2}:\d{2}:\d{2}/);
    if (time) {
      const _time = time[0].replace('time=', '');
      console.log(_time);
      console.log(parse(_time, 'hh:mm:ss', new Date()));
    }
  }

  private async runFFmpegCommand(args: string[]) {
    return new Promise((resolve) => {
      const command = `${ffmpeg} ${args.join(' ')}`;
      log('info', 'Run command', command);
      const fC = exec(command, { env: process.env }, (error) => {
        if (error) {
          log('error', 'FFmpeg command error', error);
          resolve(error.code);
        }
      });
      fC.stdout?.on('data', (d) => {
        log('log', 'stdout', d);
      });
      fC.stderr?.on('data', (d) => {
        log('info', 'stderr', d);
        this.parseTime(d);
      });
      fC.on('exit', (code) => {
        log('info', 'FFmpeg command exit with code', code);
        resolve(code);
      });
    });
  }
}

export default FFmpeg;

if (isDev) {
  new FFmpeg({
    rtc: new RTC({ ws: new WS({ db: new DB() }) }),
    videoSrc: '/home/kol/Projects/werift-sfu-react/packages/server/rec/1673324498132-1673327462937',
  }).createVideo();
}
