"use client";

import { useCallback, useState, useId } from "react";
import { Upload, FileSpreadsheet, Check, X, FileArchive } from "lucide-react";

interface FileDropzoneProps {
  label: string;
  sublabel: string;
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
}

const acceptedExtensions = [".csv", ".xlsx", ".xls", ".zip"];

export function FileDropzone({
  label,
  sublabel,
  onFileSelect,
  selectedFile,
  onClear,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();

  const validateFile = useCallback((file: File): boolean => {
    const extension = "." + file.name.split(".").pop()?.toLowerCase();
    if (!acceptedExtensions.includes(extension)) {
      setError("Please upload a CSV, XLSX, or ZIP file");
      return false;
    }
    if (file.size > 500 * 1024 * 1024) {
      setError("File exceeds maximum size of 500MB");
      return false;
    }
    setError(null);
    return true;
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file && validateFile(file)) {
        onFileSelect(file);
      }
    },
    [onFileSelect, validateFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && validateFile(file)) {
        onFileSelect(file);
      }
      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [onFileSelect, validateFile]
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const FileIcon = selectedFile?.name.endsWith(".zip") ? FileArchive : FileSpreadsheet;

  return (
    <div className="relative bg-card rounded-xl overflow-hidden border border-border">
      <div className="p-6">
        {/* Header */}
        <div className="mb-5">
          <h3 className="text-lg font-semibold font-display tracking-tight text-foreground">
            {label}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">{sublabel}</p>
        </div>

        {selectedFile ? (
          /* File selected state */
          <div className="rounded-lg bg-accent/5 border border-accent/20 p-5">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                <FileIcon className="w-6 h-6 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium font-mono text-sm text-foreground truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-accent" />
                </div>
                <button
                  onClick={onClear}
                  className="w-8 h-8 rounded-lg bg-muted/50 hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Upload dropzone state - using label for native file input triggering */
          <label
            htmlFor={inputId}
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
            className={`
              block rounded-lg cursor-pointer transition-all duration-300 border-2 border-dashed
              ${isDragging ? "border-accent bg-accent/5" : "border-border bg-muted/20 hover:bg-muted/30 hover:border-accent/50"}
            `}
          >
            <input
              id={inputId}
              type="file"
              accept=".csv,.xlsx,.xls,.zip"
              onChange={handleFileInput}
              className="sr-only"
            />
            <div className="p-10 flex flex-col items-center justify-center text-center">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center mb-4 ${isDragging ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"}`}>
                <Upload className="w-6 h-6" />
              </div>
              <p className={`text-sm font-medium ${isDragging ? "text-accent" : "text-foreground"}`}>
                {isDragging ? "Drop file here" : "Drag & drop or click to upload"}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                CSV, XLSX, or ZIP up to 500MB
              </p>
            </div>
          </label>
        )}

        {/* Error message */}
        {error && (
          <p className="text-sm text-destructive mt-3 flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-destructive" />
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
