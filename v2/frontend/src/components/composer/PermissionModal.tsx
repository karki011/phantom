// Author: Subash Karki
import { Shield } from 'lucide-solid'
import type { PermissionRequest } from '@/core/composer/types'
import * as css from './PermissionModal.css'

interface PermissionModalProps {
  permission: PermissionRequest
  onApprove: () => void
  onDeny: () => void
}

export const PermissionModal = (props: PermissionModalProps) => {
  return (
    <div class={css.container}>
      <div class={css.icon}>
        <Shield size={20} />
      </div>
      <div class={css.info}>
        <span class={css.toolLabel}>{props.permission.toolName}</span>
        <span class={css.description}>{props.permission.description}</span>
      </div>
      <div class={css.actions}>
        <button class={css.denyBtn} onClick={props.onDeny}>
          Deny
        </button>
        <button class={css.approveBtn} onClick={props.onApprove}>
          Allow
        </button>
      </div>
    </div>
  )
}
