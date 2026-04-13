/**
 * SystemToast Utility
 * Shows system-styled toast notifications via react-toastify
 *
 * @author Subash Karki
 */
import { toast } from 'react-toastify';

type NotificationType = 'info' | 'success' | 'warning';

export const showSystemNotification = (
  title: string,
  message: string,
  type: NotificationType = 'info',
) => {
  toast[type](`${title} — ${message}`, {
    autoClose: 4000,
  });
};
