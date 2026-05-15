"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  PHONE_STATUSES,
  PHONE_STATUS_LABELS,
} from "@/lib/schemas";
import { createPhoneAction, editPhoneAction } from "./actions";

const formSchema = z.object({
  name: z.string().min(1, "Required"),
  imeiSerial: z.string().optional(),
  status: z.enum(PHONE_STATUSES),
  notes: z.string().optional(),
});
type FormValues = z.infer<typeof formSchema>;

export type PhoneFormInitial = {
  id: string;
  values: Partial<FormValues>;
};

export function PhoneForm({
  initial,
}: {
  initial?: PhoneFormInitial | null;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      imeiSerial: "",
      status: "available",
      notes: "",
      ...initial?.values,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const input = {
      name: values.name,
      imeiSerial: values.imeiSerial || undefined,
      status: values.status,
      notes: values.notes || undefined,
    };
    const result = initial
      ? await editPhoneAction(initial.id, input)
      : await createPhoneAction(input);
    if (!result.ok) {
      setServerError(result.error);
      return;
    }
    startTransition(() => {
      router.push(`/phones/${result.id}`);
      router.refresh();
    });
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label="Name / nickname"
          required
          error={errors.name?.message}
          hint="What you call this phone in conversation. E.g. 'Phone 3' or 'Loaner A'."
        >
          <Input {...register("name")} autoFocus />
        </Field>
        <Field label="IMEI / Serial">
          <Input {...register("imeiSerial")} />
        </Field>
        <Field label="Status">
          <Select {...register("status")}>
            {PHONE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PHONE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Notes">
        <textarea
          {...register("notes")}
          rows={4}
          placeholder="Carrier, plan, condition, anything worth knowing."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </Field>

      {serverError && (
        <p className="text-sm text-destructive">{serverError}</p>
      )}

      <div className="flex items-center gap-3 border-t border-border pt-6">
        <button
          type="submit"
          disabled={isSubmitting || isPending}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-[color:var(--wtw-deep-gold)] hover:text-white disabled:opacity-50"
        >
          {isSubmitting || isPending
            ? "Saving…"
            : initial
              ? "Save changes"
              : "Save phone"}
        </button>
        <button
          type="button"
          onClick={() =>
            router.push(initial ? `/phones/${initial.id}` : "/phones")
          }
          className="text-sm font-bold text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-bold">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const inputClasses =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={inputClasses} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={inputClasses} />;
}
