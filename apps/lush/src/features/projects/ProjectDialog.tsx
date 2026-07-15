import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";

export function ProjectDialog(props: {
  open: boolean;
  title: string;
  description: string;
  initialName?: string;
  submitLabel: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const [name, setName] = useState(props.initialName ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!props.open) return;
    setName(props.initialName ?? "");
    setError("");
  }, [props.initialName, props.open]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{props.title}</DialogTitle>
          <DialogDescription>{props.description}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const nextName = name.trim();
            if (!nextName || pending) return;
            setPending(true);
            setError("");
            void props.onSubmit(nextName)
              .then(() => props.onOpenChange(false))
              .catch((caught) =>
                setError(caught instanceof Error ? caught.message : "Unable to save project")
              )
              .finally(() => setPending(false));
          }}
        >
          <Input
            autoFocus
            value={name}
            maxLength={120}
            placeholder="Project name"
            onChange={(event) => setName(event.target.value)}
          />
          {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || pending}>
              {pending ? "Saving..." : props.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
