"use client"

import * as React from "react"
import {
  forwardRef,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
  type ReactNode,
} from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { Icon, MappedIcon, type IconName, ICON_MAP, type MappedIconName } from "./Icon"

// =============================================================================
// INPUT VARIANTS (CVA Pattern)
// =============================================================================

/**
 * Shadcn-compatible Input Variants - OpenClaw Mission Control Design System
 */
const inputVariants = cva(
  // Base styles
  [
    "w-full",
    "text-[14px] leading-[1.5]",
    "text-[var(--text-primary)]",
    "placeholder:text-[var(--text-placeholder)]",
    "bg-[rgba(255,255,255,0.03)]",
    "border border-[var(--border-subtle)]",
    "rounded-[var(--radius-md)]",
    "transition-all duration-[var(--duration-normal)]",
    // Hover
    "hover:border-[var(--border-default)]",
    "hover:bg-[rgba(255,255,255,0.04)]",
    // Focus
    "focus:outline-none",
    "focus:border-[var(--accent-primary)]",
    "focus:bg-[rgba(255,255,255,0.05)]",
    "focus:ring-[3px] focus:ring-[var(--accent-soft)]",
    // Focus visible
    "focus-visible:outline-none",
    "focus-visible:border-[var(--accent-primary)]",
    "focus-visible:ring-[3px] focus-visible:ring-[var(--accent-soft)]",
    // Disabled
    "disabled:opacity-50 disabled:cursor-not-allowed",
    // File input styling
    "file:border-0 file:bg-transparent file:text-sm file:font-medium",
    "file:text-[var(--text-primary)]",
  ],
  {
    variants: {
      inputSize: {
        default: "h-11 px-4 text-[14px]",
        sm: "h-9 px-3 text-[13px]",
        md: "h-11 px-4 text-[14px]",
        lg: "h-13 px-5 text-[15px]",
      },
    },
    defaultVariants: {
      inputSize: "default",
    },
  }
)

// =============================================================================
// INPUT COMPONENT
// =============================================================================

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {
  /** Label text */
  label?: string
  /** Helper text below input */
  hint?: string
  /** Error message (replaces hint when present) */
  error?: string
  /** Size preset - use inputSize to avoid conflict with HTML size attribute */
  size?: "sm" | "md" | "lg" | "default"
  /** Left icon */
  icon?: IconName
  /** Use mapped icon name */
  mappedIcon?: MappedIconName
  /** Full width */
  fullWidth?: boolean
  /** Wrapper class */
  wrapperClassName?: string
}

/**
 * Input component with label, hint, error, and icon support
 *
 * @example
 * // Basic usage
 * <Input placeholder="Enter text..." />
 *
 * // With label and hint
 * <Input label="Title" placeholder="Task title" hint="Enter a descriptive title" />
 *
 * // With icon
 * <Input mappedIcon="search" placeholder="Search..." />
 *
 * // With error
 * <Input label="Email" error="Invalid email address" />
 */
const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hint,
      error,
      size = "md",
      inputSize,
      icon,
      mappedIcon,
      fullWidth = true,
      wrapperClassName,
      className,
      id,
      type = "text",
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId()
    const inputId = id ?? `input-${generatedId}`
    const iconName = mappedIcon ? (ICON_MAP[mappedIcon] as IconName) : icon
    const hasError = !!error
    const resolvedSize = inputSize || size

    // Simple input without wrapper for shadcn compatibility
    if (!label && !hint && !error && !iconName) {
      return (
        <input
          ref={ref}
          id={inputId}
          type={type}
          data-slot="input"
          className={cn(
            inputVariants({ inputSize: resolvedSize }),
            hasError && "border-[var(--accent-error)] focus:ring-[rgba(239,68,68,0.2)]",
            className
          )}
          {...props}
        />
      )
    }

    return (
      <div className={cn(fullWidth ? "w-full" : "w-auto", wrapperClassName)}>
        {/* Label */}
        {label && (
          <label
            htmlFor={inputId}
            className="block text-label text-[var(--text-muted)] mb-2"
          >
            {label}
          </label>
        )}

        {/* Input wrapper for icon positioning */}
        <div className="relative">
          {/* Left icon */}
          {iconName && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]">
              <Icon name={iconName} size="sm" />
            </div>
          )}

          {/* Input */}
          <input
            ref={ref}
            id={inputId}
            type={type}
            data-slot="input"
            className={cn(
              inputVariants({ inputSize: resolvedSize }),
              iconName && "pl-10",
              hasError && "border-[var(--accent-error)] focus:ring-[rgba(239,68,68,0.2)]",
              className
            )}
            aria-invalid={hasError}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          />
        </div>

        {/* Error or Hint */}
        {(error || hint) && (
          <p
            id={error ? `${inputId}-error` : `${inputId}-hint`}
            className={cn(
              "mt-2 text-small",
              error ? "text-[var(--accent-error)]" : "text-[var(--text-dim)]"
            )}
          >
            {error || hint}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = "Input"

// =============================================================================
// TEXTAREA COMPONENT
// =============================================================================

const textareaVariants = cva(
  [
    "w-full",
    "text-[14px] leading-[1.5]",
    "text-[var(--text-primary)]",
    "placeholder:text-[var(--text-placeholder)]",
    "bg-[rgba(255,255,255,0.03)]",
    "border border-[var(--border-subtle)]",
    "rounded-[var(--radius-md)]",
    "transition-all duration-[var(--duration-normal)]",
    "resize-y min-h-[80px]",
    // Hover
    "hover:border-[var(--border-default)]",
    "hover:bg-[rgba(255,255,255,0.04)]",
    // Focus
    "focus:outline-none",
    "focus:border-[var(--accent-primary)]",
    "focus:bg-[rgba(255,255,255,0.05)]",
    "focus:ring-[3px] focus:ring-[var(--accent-soft)]",
    // Focus visible
    "focus-visible:outline-none",
    "focus-visible:ring-[3px] focus-visible:ring-[var(--accent-soft)]",
    // Disabled
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ],
  {
    variants: {
      textareaSize: {
        default: "px-4 py-3",
        sm: "px-3 py-2",
        md: "px-4 py-3",
        lg: "px-5 py-4",
      },
    },
    defaultVariants: {
      textareaSize: "default",
    },
  }
)

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "size">,
    VariantProps<typeof textareaVariants> {
  /** Label text */
  label?: string
  /** Helper text below textarea */
  hint?: string
  /** Error message */
  error?: string
  /** Size preset */
  size?: "sm" | "md" | "lg" | "default"
  /** Full width */
  fullWidth?: boolean
  /** Wrapper class */
  wrapperClassName?: string
}

/**
 * Textarea component with label, hint, and error support
 *
 * @example
 * <Textarea placeholder="Enter description..." />
 * <Textarea label="Description" placeholder="Add details..." rows={4} />
 */
const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      hint,
      error,
      size = "md",
      textareaSize,
      fullWidth = true,
      wrapperClassName,
      className,
      id,
      rows = 3,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId()
    const inputId = id ?? `textarea-${generatedId}`
    const hasError = !!error
    const resolvedSize = textareaSize || size

    // Simple textarea without wrapper for shadcn compatibility
    if (!label && !hint && !error) {
      return (
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          data-slot="textarea"
          className={cn(
            textareaVariants({ textareaSize: resolvedSize }),
            hasError && "border-[var(--accent-error)] focus:ring-[rgba(239,68,68,0.2)]",
            className
          )}
          {...props}
        />
      )
    }

    return (
      <div className={cn(fullWidth ? "w-full" : "w-auto", wrapperClassName)}>
        {/* Label */}
        {label && (
          <label
            htmlFor={inputId}
            className="block text-label text-[var(--text-muted)] mb-2"
          >
            {label}
          </label>
        )}

        {/* Textarea */}
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          data-slot="textarea"
          className={cn(
            textareaVariants({ textareaSize: resolvedSize }),
            hasError && "border-[var(--accent-error)] focus:ring-[rgba(239,68,68,0.2)]",
            className
          )}
          aria-invalid={hasError}
          aria-describedby={
            error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
          }
          {...props}
        />

        {/* Error or Hint */}
        {(error || hint) && (
          <p
            id={error ? `${inputId}-error` : `${inputId}-hint`}
            className={cn(
              "mt-2 text-small",
              error ? "text-[var(--accent-error)]" : "text-[var(--text-dim)]"
            )}
          >
            {error || hint}
          </p>
        )}
      </div>
    )
  }
)

Textarea.displayName = "Textarea"

// =============================================================================
// SELECT VARIANTS (CVA Pattern)
// =============================================================================

const selectVariants = cva(
  [
    "w-full",
    "text-[var(--text-primary)]",
    "bg-[rgba(255,255,255,0.03)]",
    "border border-[var(--border-subtle)]",
    "rounded-[var(--radius-md)]",
    "transition-all duration-[var(--duration-normal)]",
    "cursor-pointer appearance-none",
    "pr-10",
    // Hover
    "hover:border-[var(--border-default)]",
    "hover:bg-[rgba(255,255,255,0.04)]",
    // Focus
    "focus:outline-none",
    "focus:border-[var(--accent-primary)]",
    "focus:bg-[rgba(255,255,255,0.05)]",
    "focus:ring-[3px] focus:ring-[var(--accent-soft)]",
    // Focus visible
    "focus-visible:outline-none",
    "focus-visible:ring-[3px] focus-visible:ring-[var(--accent-soft)]",
    // Disabled
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ],
  {
    variants: {
      selectSize: {
        default: "h-11 px-4 text-[14px]",
        sm: "h-9 px-3 text-[13px]",
        md: "h-11 px-4 text-[14px]",
        lg: "h-13 px-5 text-[15px]",
      },
    },
    defaultVariants: {
      selectSize: "default",
    },
  }
)

// =============================================================================
// SELECT COMPONENT
// =============================================================================

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size">,
    VariantProps<typeof selectVariants> {
  /** Label text */
  label?: string
  /** Helper text below select */
  hint?: string
  /** Error message */
  error?: string
  /** Size preset - use selectSize to avoid conflict with HTML size attribute */
  size?: "sm" | "md" | "lg" | "default"
  /** Options array */
  options: SelectOption[]
  /** Placeholder option */
  placeholder?: string
  /** Full width */
  fullWidth?: boolean
  /** Wrapper class */
  wrapperClassName?: string
}

/**
 * Select component with label, options, and error support
 *
 * @example
 * <Select
 *   label="Priority"
 *   options={[
 *     { value: "low", label: "Low" },
 *     { value: "normal", label: "Normal" },
 *     { value: "high", label: "High" },
 *   ]}
 *   placeholder="Select priority"
 * />
 */
const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      hint,
      error,
      size = "md",
      selectSize,
      options,
      placeholder,
      fullWidth = true,
      wrapperClassName,
      className,
      id,
      ...props
    },
    ref
  ) => {
    const generatedId = React.useId()
    const inputId = id ?? `select-${generatedId}`
    const hasError = !!error
    const resolvedSize = selectSize || size

    return (
      <div className={cn(fullWidth ? "w-full" : "w-auto", wrapperClassName)}>
        {/* Label */}
        {label && (
          <label
            htmlFor={inputId}
            className="block text-label text-[var(--text-muted)] mb-2"
          >
            {label}
          </label>
        )}

        {/* Select */}
        <div className="relative">
          <select
            ref={ref}
            id={inputId}
            data-slot="select"
            className={cn(
              selectVariants({ selectSize: resolvedSize }),
              hasError && "border-[var(--accent-error)] focus:ring-[rgba(239,68,68,0.2)]",
              className
            )}
            aria-invalid={hasError}
            aria-describedby={
              error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
            }
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>

          {/* Chevron icon */}
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-dim)]">
            <MappedIcon name="chevronDown" size="sm" />
          </div>
        </div>

        {/* Error or Hint */}
        {(error || hint) && (
          <p
            id={error ? `${inputId}-error` : `${inputId}-hint`}
            className={cn(
              "mt-2 text-small",
              error ? "text-[var(--accent-error)]" : "text-[var(--text-dim)]"
            )}
          >
            {error || hint}
          </p>
        )}
      </div>
    )
  }
)

Select.displayName = "Select"

// =============================================================================
// FORM GROUP
// =============================================================================

export interface FormGroupProps {
  children: ReactNode
  /** Grid columns on larger screens */
  columns?: 1 | 2 | 3 | 4
  /** Gap between items */
  gap?: "sm" | "md" | "lg"
  className?: string
}

const columnClasses = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
}

const gapClasses = {
  sm: "gap-3",
  md: "gap-4",
  lg: "gap-6",
}

/**
 * Form group for organizing form fields
 *
 * @example
 * <FormGroup columns={2}>
 *   <Input label="First Name" />
 *   <Input label="Last Name" />
 * </FormGroup>
 */
function FormGroup({
  children,
  columns = 1,
  gap = "md",
  className,
}: FormGroupProps) {
  return (
    <div className={cn("grid", columnClasses[columns], gapClasses[gap], className)}>
      {children}
    </div>
  )
}

export { Input, Textarea, Select, FormGroup, inputVariants, textareaVariants, selectVariants }
export default Input
