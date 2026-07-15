type NamedFormControls = {
  namedItem(name: string): unknown;
};

type ResettableTextControl = {
  value: string;
  defaultValue: string;
};

export function resetPromptMessageField(elements: NamedFormControls) {
  const field = elements.namedItem("message");
  if (!isResettableTextControl(field)) return;
  field.value = field.defaultValue;
}

function isResettableTextControl(
  value: unknown
): value is ResettableTextControl {
  return Boolean(
    value &&
      typeof value === "object" &&
      "value" in value &&
      typeof value.value === "string" &&
      "defaultValue" in value &&
      typeof value.defaultValue === "string"
  );
}
