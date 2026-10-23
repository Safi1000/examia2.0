"use client";

import { useState } from "react";
import { Button, Modal } from "@/components/ui";
import { buttonClasses } from "@/components/ui/Button";
import { useToast } from "@/components/toast";
import { waDigits } from "@/lib/phone";
import { resetMessage, welcomeMessage } from "@/lib/welcome-message";

/**
 * "Send login details": the ready-made WhatsApp message with the student's
 * username, password, sign-in link and first steps. Editable before sending;
 * opens WhatsApp to the student or the parent with it typed in.
 */
export function LoginDetails({
  open,
  onClose,
  kind,
  username,
  password,
  phone,
  parent,
}: {
  open: boolean;
  onClose: () => void;
  kind: "welcome" | "reset";
  username: string;
  password: string;
  phone?: string;
  parent?: string;
}) {
  const { toast } = useToast();
  const initial = (kind === "welcome" ? welcomeMessage : resetMessage)({ username, password });
  const [text, setText] = useState(initial);
  const [seen, setSeen] = useState(initial);
  // A new student or password: start from the fresh template.
  if (seen !== initial) {
    setSeen(initial);
    setText(initial);
  }
  const wa = (to: string) => `https://wa.me/${waDigits(to)}?text=${encodeURIComponent(text)}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={kind === "welcome" ? "Send their login details" : "New password"}
      description={kind === "welcome" ? "Student added. Here's a ready message: edit anything, then send." : "Their old password no longer works. Send them this."}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(text).then(() => toast("Message copied.", "success"));
            }}
          >
            Copy
          </Button>
          {parent && (
            <a href={wa(parent)} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "secondary" })}>
              WhatsApp parent
            </a>
          )}
          {phone && (
            <a href={wa(phone)} target="_blank" rel="noreferrer" className={buttonClasses()}>
              WhatsApp student
            </a>
          )}
        </>
      }
    >
      <p className="mb-3 rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-center font-mono text-lg font-bold tracking-wide text-ink">
        {username} · {password}
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        aria-label="Message"
        className="w-full rounded-lg border border-border-strong bg-surface p-3 text-sm leading-relaxed text-ink"
      />
      {!phone && !parent && <p className="mt-2 text-xs text-ink-3">No WhatsApp numbers saved for this student. Copy the message instead.</p>}
    </Modal>
  );
}
