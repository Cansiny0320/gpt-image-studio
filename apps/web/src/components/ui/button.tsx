import { Button as BaseButton } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';
const variants = cva('button', {
  variants: {
    variant: { default: 'button-primary', ghost: 'button-ghost', outline: 'button-outline' },
    size: { default: '', icon: 'button-icon' },
  },
  defaultVariants: { variant: 'default', size: 'default' },
});
export function Button({
  className,
  variant,
  size,
  ...props
}: BaseButton.Props & VariantProps<typeof variants>) {
  return (
    <BaseButton
      className={(state) =>
        twMerge(variants({ variant, size }), typeof className === 'function' ? className(state) : className)
      }
      {...props}
    />
  );
}
