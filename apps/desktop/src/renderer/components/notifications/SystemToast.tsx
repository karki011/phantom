/**
 * SystemToast Utility
 * Shows system-styled toast notifications via react-toastify
 *
 * @author Subash Karki
 */
import { type Id, toast } from 'react-toastify';

type NotificationType = 'info' | 'success' | 'warning';

export const showSystemNotification = (
  title: string,
  message: string,
  type: NotificationType = 'info',
  opts?: { persistent?: boolean },
): Id => {
  return toast[type](`${title} — ${message}`, {
    autoClose: opts?.persistent ? false : 4000,
  });
};

export const updateSystemNotification = (
  id: Id,
  title: string,
  message: string,
  type: NotificationType = 'success',
) => {
  toast.update(id, {
    render: `${title} — ${message}`,
    type,
    autoClose: 4000,
  });
};
