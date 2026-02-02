- you never have to ask me to run the dev server - it is always running in a seperate terminal

## Deployment

- Hosted on Coolify at `49.13.124.226`
- CI/CD deploys from `main` branch
- `next start` (production mode) serves from the `.next` build output — source changes have NO effect until `next build` runs (either locally or via CI/CD)
- After pushing, trigger a redeploy in the Coolify dashboard if auto-deploy is not configured

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

### File Upload Size Limits (THREE places to keep in sync)
CDR files can be 100-300MB each. Upload limits must be configured in three places:

1. **`next.config.js` > `experimental.proxyClientMaxBodySize`** — Next.js middleware proxy limit for the total request body. Must be >= sum of both files. Currently `1gb`. If this is too low, the body gets silently truncated and `request.formData()` fails with "Failed to parse body as FormData."
2. **`next.config.js` > `experimental.serverActions.bodySizeLimit`** — Server Actions body limit. Currently `500mb`.
3. **`src/app/api/process/route.ts` > `MAX_FILE_SIZE`** — Per-file validation in the route handler. Currently `500MB`. If this is too low, returns a 413 error with a clear message.

Do NOT use `busboy` + `Readable.fromWeb()` for multipart parsing in Next.js App Router — it causes "Unexpected end of form" errors. Use the standard `request.formData()` API instead.