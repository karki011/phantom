/**
 * SystemToast Utility
 * Shows system-styled Mantine notifications with Lucide icons
 *
 * @author Subash Karki
 */
import { notifications } from '@mantine/notifications';
import { AlertTriangle, CheckCircle, Info } from 'lucide-react';
import { createElement } from 'react';

type NotificationType = 'info' | 'success' | 'warning';

const ICON_MAP: Record<NotificationType, typeof Info> = {
  info: Info,
  success: CheckCircle,
  warning: AlertTriangle,
};

const COLOR_MAP: Record<NotificationType, string> = {
  info: 'blue',
  success: 'green',
  warning: 'orange',
};

export const showSystemNotification = (
  title: string,
  message: string,
  type: NotificationType = 'info',
) => {
  const Icon = ICON_MAP[type];

  notifications.show({
    title: `[System]: ${title}`,
    message,
    color: COLOR_MAP[type],
    icon: createElement(Icon, { size: 18, 'aria-hidden': true }),
    autoClose: 5000,
  });
};
