/**
 * PhantomModal — shared Modal wrapper with consistent phantom theme styling.
 * Use this instead of Mantine's Modal directly to keep all modals DRY.
 *
 * @author Subash Karki
 */
import { Modal, type ModalProps } from '@mantine/core';

export function PhantomModal(props: ModalProps) {
  return (
    <Modal
      centered
      size="lg"
      padding="xl"
      radius="md"
      {...props}
      styles={{
        header: {
          backgroundColor: 'var(--phantom-surface-card)',
          borderBottom: '1px solid var(--phantom-border-subtle)',
          padding: '16px 24px',
        },
        body: { backgroundColor: 'var(--phantom-surface-bg)', padding: '24px' },
        content: { backgroundColor: 'var(--phantom-surface-bg)' },
        ...props.styles,
      }}
    />
  );
}
