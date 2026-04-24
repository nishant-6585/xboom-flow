import { Button, ButtonProps } from '@/components/ui/button';
import { Phone, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInitiateCall, CallEntityType } from '@/hooks/useInitiateCall';

interface CallButtonProps extends Omit<ButtonProps, 'onClick'> {
  phoneNumber: string | null | undefined;
  entityType?: CallEntityType;
  entityId?: string | null;
  /** When true, renders only the phone icon */
  iconOnly?: boolean;
  label?: string;
  onAfterCall?: () => void;
}

/**
 * Centralized outbound call button — replaces ad-hoc `tel:` links.
 * All calls route via Exotel → ElevenLabs Flow and are logged in `call_logs`.
 */
export function CallButton({
  phoneNumber,
  entityType,
  entityId,
  iconOnly = false,
  label = 'Call',
  className,
  variant = 'outline',
  size = iconOnly ? 'icon' : 'sm',
  disabled,
  onAfterCall,
  ...rest
}: CallButtonProps) {
  const { initiate, isCalling } = useInitiateCall();

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const result = await initiate({ phoneNumber, entityType, entityId });
    if (result.success && onAfterCall) onAfterCall();
  };

  const isDisabled = disabled || isCalling || !phoneNumber;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(className)}
      disabled={isDisabled}
      onClick={handleClick}
      title={phoneNumber ? `Call ${phoneNumber}` : 'No phone number'}
      {...rest}
    >
      {isCalling ? (
        <Loader2 className={cn('animate-spin', iconOnly ? 'w-4 h-4' : 'w-4 h-4 mr-2')} />
      ) : (
        <Phone className={cn(iconOnly ? 'w-4 h-4' : 'w-4 h-4 mr-2')} />
      )}
      {!iconOnly && (isCalling ? 'Calling…' : label)}
    </Button>
  );
}