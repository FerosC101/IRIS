import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "iris-button inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "iris-button-primary",
        secondary: "iris-button-secondary",
        ghost: "iris-button-ghost",
        danger: "iris-button-danger",
        link: "iris-button-link h-auto p-0 underline-offset-2 hover:underline",
      },
      size: {
        md: "min-h-11 px-4 py-2 sm:min-h-10",
        sm: "min-h-11 px-3 py-1.5 text-[13px] sm:min-h-8",
        icon: "size-11 sm:size-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), variant === "link" && "min-h-0", className)} {...props} />
));
Button.displayName = "Button";

export { buttonVariants };
