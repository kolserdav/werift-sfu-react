/******************************************************************************************
 * Repository: https://github.com/kolserdav/werift-sfu-react.git
 * File name: windowResize.ts
 * Author: Sergey Kolmiller
 * Email: <kolserdav@uyem.ru>
 * License: MIT
 * License text: See in LICENSE file
 * Copyright: kolserdav, All rights reserved (c)
 * Create Date: Wed Aug 02 2023 23:56:49 GMT+0700 (Krasnoyarsk Standard Time)
 ******************************************************************************************/
import { createSlice, configureStore } from '@reduxjs/toolkit';

interface State {
  windowResize: number;
}

interface Action {
  payload: State;
}

const slice = createSlice({
  name: 'windowResize',
  initialState: {
    windowResize: 0,
  } as State,
  reducers: {
    changeWindowResize: (state: State, action: Action) => {
      // eslint-disable-next-line no-param-reassign
      state.windowResize = action.payload.windowResize;
    },
  },
});

export const { changeWindowResize } = slice.actions;

const storeWindowResize = configureStore({
  reducer: slice.reducer,
});

export default storeWindowResize;
