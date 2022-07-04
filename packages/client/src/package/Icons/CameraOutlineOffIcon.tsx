/******************************************************************************************
 * Repository: https://github.com/kolserdav/react-node-webrtc-sfu.git
 * File name: CameraOutlineOffIcon.tsx
 * Author: Sergey Kolmiller
 * Email: <uyem.ru@gmail.com>
 * License: BSD-2-Clause
 * License text: Binary distributions of this software include 'wrtc' and other third-party libraries.
 * Copyright: kolserdav, All rights reserved (c)
 * Create Date: Mon Jul 04 2022 10:58:51 GMT+0700 (Krasnoyarsk Standard Time)
 ******************************************************************************************/
import React from 'react';
import Icon, { IconProps } from './Icon';

function CameraOutlineOffIcon(props: Omit<IconProps, 'children'>) {
  return (
    <Icon {...props}>
      M17 12C17 12.54 16.9 13.05 16.74 13.54L15 11.78C14.87 10.3 13.7 9.13 12.22 9L10.46 7.26C10.95
      7.1 11.46 7 12 7C14.76 7 17 9.24 17 12M9.88 4H14.12L15.95 6H20V16.8L21.88 18.68C21.96 18.47 22
      18.24 22 18V6C22 4.89 21.11 4 20 4H16.83L15 2H9L7.18 4L8.6 5.4L9.88 4M22.11 21.46L20.84
      22.73L18.11 20H4C2.9 20 2 19.11 2 18V6C2 5.42 2.25 4.9 2.65 4.54L1.11 3L2.39 1.73L22.11
      21.46M9 12C9 13.66 10.34 15 12 15C12.33 15 12.65 14.93 12.94 14.83L9.17 11.06C9.07 11.36 9
      11.67 9 12M16.11 18L14.45 16.34C13.72 16.75 12.89 17 12 17C9.24 17 7 14.76 7 12C7 11.11 7.25
      10.28 7.66 9.55L4.11 6H4V18H16.11Z
    </Icon>
  );
}

export default CameraOutlineOffIcon;
