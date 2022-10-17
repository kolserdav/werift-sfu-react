/******************************************************************************************
 * Repository: https://github.com/kolserdav/werift-sfu-react.git
 * File name: Chat.tsx
 * Author: Sergey Kolmiller
 * Email: <uyem.ru@gmail.com>
 * License: MIT
 * License text: See in LICENSE file
 * Copyright: kolserdav, All rights reserved (c)
 * Create Date: Wed Aug 24 2022 14:14:09 GMT+0700 (Krasnoyarsk Standard Time)
 ******************************************************************************************/
import React, { useMemo, useRef } from 'react';
import clsx from 'clsx';
import s from './Chat.module.scss';
import g from '../Global.module.scss';
import SendIcon from '../Icons/Send';
import IconButton from './ui/IconButton';
import { useMesages, useDialog, useScrollToQuote, useRoomIsInactive } from './Chat.hooks';
import { dateToTime, dateToString, isMobile } from '../utils/lib';
import { prepareMessage } from './Chat.lib';
import Dialog from './ui/Dialog';
import { ChatProps } from '../types';
import CheckIcon from '../Icons/Check';
import CloseIcon from '../Icons/Close';
import { MOBILE_WIDTH, TEXT_AREA_BORDER_WIDTH, TEXT_AREA_PADDING_LEFT } from '../utils/constants';

function Chat({ server, port, roomId, userId, locale, theme }: ChatProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    message,
    messages,
    changeText,
    sendMessage,
    rows,
    clickQuoteWrapper,
    clickEditWrapper,
    clickDeleteWrapper,
    error,
    editMessage,
    onClickCloseEditMessage,
  } = useMesages({
    port,
    server,
    userId,
    roomId,
    containerRef,
    inputRef,
    locale,
  });
  const { dialog, messageContextWrapper } = useDialog();
  useScrollToQuote({ messages, containerRef });
  const roomIsInactive = useRoomIsInactive();

  const textAreaLeft = useMemo(
    () => () => {
      const { current } = inputRef;
      let res = 0;
      if (current) {
        const { left, width } = current.getBoundingClientRect();
        res =
          document.body.clientWidth > MOBILE_WIDTH
            ? left - width - TEXT_AREA_PADDING_LEFT + TEXT_AREA_BORDER_WIDTH
            : TEXT_AREA_BORDER_WIDTH;
      }
      return res;
    },
    [inputRef]
  );

  return (
    <div className={s.wrapper} style={{ background: theme?.colors.active }}>
      <div
        className={s.container}
        ref={containerRef}
        style={{ height: `calc(90% - ${rows} * ${isMobile() ? '0.5rem' : '1rem'})` }}
      >
        {messages.length ? (
          messages.map((item, index) => (
            <div className={s.message__wrapper} key={item.id} id={item.id.toString()}>
              {new Date(item.created).getDay() !==
                new Date(messages[index - 1]?.created).getDay() && (
                <p className={s.day}>{dateToString(new Date(item.created))}</p>
              )}
              <div
                onContextMenu={messageContextWrapper(item, item.unitId === userId.toString())}
                style={{ background: theme?.colors.paper, color: theme?.colors.text }}
                className={clsx(s.message, item.unitId === userId.toString() ? s.self : '')}
              >
                {item.unitId !== userId.toString() && (
                  <div className={s.name}>{item.Unit.name}</div>
                )}
                <div
                  className={s.text}
                  dangerouslySetInnerHTML={{ __html: prepareMessage(item.text) }}
                />
                <div className={s.date}>
                  {item.created !== item.updated ? (
                    <span className={s.edited}>{locale.edited}</span>
                  ) : (
                    ''
                  )}
                  {dateToTime(
                    new Date(item.created !== item.updated ? item.updated : item.created)
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className={s.no__messages}>{error ? locale.noMessages : locale.loading}</div>
        )}
      </div>
      <div className={s.input}>
        {editMessage && (
          <div className={s.info}>
            <div
              className={s.block}
              style={{ backgroundColor: theme?.colors.paper, left: textAreaLeft() }}
            >
              <span>{locale.editMessage}</span>
              <IconButton onClick={onClickCloseEditMessage}>
                <CloseIcon width={24} height={24} color={theme?.colors.text} />
              </IconButton>
            </div>
          </div>
        )}
        <div className={s.group}>
          <textarea
            style={{
              background: theme?.colors.paper,
              color: theme?.colors.text,
              cursor: roomIsInactive ? 'not-allowed' : 'inherit',
            }}
            rows={rows}
            ref={inputRef}
            onInput={changeText}
            value={message}
            disabled={roomIsInactive}
          />
          <IconButton
            disabled={roomIsInactive}
            className={s.send__icon}
            title={locale.send}
            onClick={sendMessage}
          >
            {editMessage ? (
              <CheckIcon color={theme?.colors.text} />
            ) : (
              <SendIcon color={theme?.colors.text} />
            )}
          </IconButton>
        </div>
      </div>
      <Dialog {...dialog} theme={theme}>
        <div className={s.message__dialog}>
          {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
          <div
            tabIndex={-1}
            role="button"
            onClick={clickQuoteWrapper(dialog.context)}
            className={g.dialog__item}
          >
            {locale.quote}
          </div>

          {dialog.secure && (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              tabIndex={-2}
              role="button"
              onClick={clickEditWrapper(dialog.context)}
              className={g.dialog__item}
            >
              {locale.edit}
            </div>
          )}
          {dialog.secure && (
            // eslint-disable-next-line jsx-a11y/click-events-have-key-events
            <div
              tabIndex={-3}
              role="button"
              onClick={clickDeleteWrapper(dialog.context)}
              className={g.dialog__item}
            >
              {locale.delete}
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
export default Chat;
