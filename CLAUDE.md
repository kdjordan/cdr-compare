- you never have to ask me to run the dev server - it is always running in a seperate terminal

## Known Issues / Patterns

### File Input Handling
Never use `ref.click()` to programmatically trigger file inputs - this causes browser crashes. Always use a `<label htmlFor={inputId}>` wrapping or associated with the file input. The native label-input association is more reliable across browsers.

```tsx
// ❌ BAD - causes browser crashes
const inputRef = useRef<HTMLInputElement>(null);
const handleClick = () => inputRef.current?.click();
<div onClick={handleClick}>...</div>
<input ref={inputRef} type="file" style={{ display: "none" }} />

// ✅ GOOD - native browser behavior
const inputId = useId();
<label htmlFor={inputId}>...</label>
<input id={inputId} type="file" className="sr-only" />
```