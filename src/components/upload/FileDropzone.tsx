"use client";

import { useCallback, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileSpreadsheet, Check, X, FileArchive } from "lucide-react";

interface FileDropzoneProps {
  label: string;
  sublabel: string;
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
  onClear: () => void;
}

const acceptedTypes = [
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "application/x-zip-compressed",
];

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

  const validateFile = useCallback((file: File): boolean => {
    const extension = "." + file.name.split(".").pop()?.toLowerCase();
    const isValidType =
      acceptedTypes.includes(file.type) ||
      acceptedExtensions.includes(extension);

    if (!isValidType) {
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && validateFile(file)) {
        onFileSelect(file);
      }
    },
    [onFileSelect, validateFile]
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileIcon = (filename: string) => {
    if (filename.endsWith(".zip")) return FileArchive;
    return FileSpreadsheet;
  };

  return (
    <div className="relative group">
      {/* Card container */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative bg-card rounded-xl overflow-hidden border-gradient"
      >
        {/* Inner border glow on hover */}
        <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none bg-gradient-to-br from-accent/5 via-transparent to-transparent" />

        <div className="relative p-6">
          {/* Header */}
          <div className="mb-5">
            <h3 className="text-lg font-semibold font-display tracking-tight text-foreground">
              {label}
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">{sublabel}</p>
          </div>

          {/* Dropzone area */}
          <AnimatePresence mode="wait">
            {selectedFile ? (
              /* File selected state */
              <motion.div
                key="selected"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
                className="relative rounded-lg bg-accent/5 border border-accent/20 p-5"
              >
                <div className="flex items-start gap-4">
                  {/* File icon */}
                  <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-accent/10 flex items-center justify-center">
                    {(() => {
                      const Icon = getFileIcon(selectedFile.name);
                      return <Icon className="w-6 h-6 text-accent" />;
                    })()}
                  </div>

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium font-mono text-sm text-foreground truncate">
                      {selectedFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>

                  {/* Status & clear */}
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
              </motion.div>
            ) : (
              /* Upload dropzone state */
              <motion.label
                key="dropzone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`
                  relative block rounded-lg cursor-pointer transition-all duration-300
                  ${
                    isDragging
                      ? "dropzone-active bg-accent/5"
                      : "dropzone-border bg-muted/20 hover:bg-muted/30"
                  }
                `}
              >
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls,.zip"
                  onChange={handleFileInput}
                  className="sr-only"
                />

                <div className="p-10 flex flex-col items-center justify-center text-center">
                  {/* Upload icon */}
                  <motion.div
                    animate={isDragging ? { scale: 1.1, y: -5 } : { scale: 1, y: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className={`
                      w-14 h-14 rounded-xl flex items-center justify-center mb-4 transition-colors duration-300
                      ${isDragging ? "bg-accent/20 text-accent" : "bg-muted text-muted-foreground"}
                    `}
                  >
                    <Upload className="w-6 h-6" />
                  </motion.div>

                  {/* Text */}
                  <p
                    className={`text-sm font-medium transition-colors duration-300 ${
                      isDragging ? "text-accent" : "text-foreground"
                    }`}
                  >
                    {isDragging ? "Drop file here" : "Drag & drop or click to upload"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    CSV, XLSX, or ZIP up to 500MB
                  </p>
                </div>
              </motion.label>
            )}
          </AnimatePresence>

          {/* Error message */}
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-sm text-destructive mt-3 flex items-center gap-2"
              >
                <span className="w-1 h-1 rounded-full bg-destructive" />
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
