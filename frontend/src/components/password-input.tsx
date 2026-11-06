"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput({ className, disabled, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);

  return <div className="relative">
    <Input {...props} type={visible ? "text" : "password"} disabled={disabled} className={cn(className, "pr-12")} />
    <Button type="button" variant="ghost" size="icon" disabled={disabled}
      className="absolute inset-y-0 right-1 my-auto text-muted-foreground focus-visible:ring-1"
      aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-controls={props.id}
      onMouseDown={event => event.preventDefault()} onClick={() => setVisible(current => !current)}>
      {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
    </Button>
  </div>;
}
