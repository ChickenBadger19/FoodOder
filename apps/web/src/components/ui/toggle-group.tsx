import * as React from 'react';
import { ToggleGroup as ToggleGroupPrimitive } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-sm text-[11px] uppercase tracking-[0.08em] font-semibold whitespace-nowrap transition-[color,box-shadow] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none",
  {
    variants: {
      variant: {
        default: 'bg-transparent border border-foreground/35 text-foreground data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=on]:border-foreground',
        warning: 'bg-transparent border border-foreground/35 text-foreground data-[state=on]:bg-warning data-[state=on]:text-warning-foreground data-[state=on]:border-warning',
        soft: 'bg-transparent border border-foreground/35 text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary',
      },
      size: { default: 'h-9 px-3 min-w-9', sm: 'h-8 px-2.5 min-w-8', lg: 'h-11 px-4 min-w-11' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

const ToggleGroupContext = React.createContext<VariantProps<typeof toggleVariants>>({ size: 'default', variant: 'default' });

function ToggleGroup({ className, variant, size, children, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <ToggleGroupPrimitive.Root data-slot="toggle-group" data-variant={variant} data-size={size} className={cn('group/toggle-group flex flex-wrap items-center gap-1.5', className)} {...props}>
      <ToggleGroupContext.Provider value={{ variant, size }}>{children}</ToggleGroupContext.Provider>
    </ToggleGroupPrimitive.Root>
  );
}

function ToggleGroupItem({ className, children, variant, size, ...props }: React.ComponentProps<typeof ToggleGroupPrimitive.Item> & VariantProps<typeof toggleVariants>) {
  const context = React.useContext(ToggleGroupContext);
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(toggleVariants({ variant: variant ?? context.variant, size: size ?? context.size }), className)}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  );
}

export { ToggleGroup, ToggleGroupItem, toggleVariants };
