import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-[3px] border px-1.5 py-[3px] text-[10px] font-semibold uppercase tracking-[0.1em] leading-none w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default: 'border-primary bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        /* block: the only dark solid. Reserved for "contains [allergen]". */
        destructive: 'border-block bg-block text-white',
        'block-soft': 'border-block-text bg-block-container text-block-text',
        outline: 'border-input text-foreground bg-transparent',
        /* safe: pale container, never a solid, so it can never match the block by lightness. */
        success: 'border-safe-text bg-safe-container text-safe-text',
        /* caution: amber with dark text; white on amber is forbidden. */
        warning: 'border-caution-text bg-caution-container text-caution-text',
        'caution-solid': 'border-caution-text bg-caution text-foreground',
        muted: 'border-input text-muted-foreground bg-transparent',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Badge({ className, variant, asChild = false, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
