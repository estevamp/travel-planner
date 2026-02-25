import React from "react";
import { Modal } from "./Modal";
import { Download, FileText, ExternalLink } from "lucide-react";

interface DocumentViewerProps {
  isOpen: boolean;
  onClose: () => void;
  docName: string;
  docUrl: string;
}

export function DocumentViewer({ isOpen, onClose, docName, docUrl }: DocumentViewerProps) {
  const getFileType = (name: string) => {
    const extension = name.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(extension || "")) return "image";
    if (extension === "pdf") return "pdf";
    if (extension === "txt") return "text";
    return "other";
  };

  const fileType = getFileType(docName);

  const renderContent = () => {
    switch (fileType) {
      case "image":
        return (
          <div className="flex items-center justify-center w-full h-full min-h-[300px]">
            <img
              src={docUrl}
              alt={docName}
              className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-sm"
            />
          </div>
        );
      case "pdf":
        return (
          <div className="w-full h-[70vh]">
            <iframe
              src={`${docUrl}#toolbar=0`}
              className="w-full h-full rounded-lg border-0"
              title={docName}
            />
          </div>
        );
      case "text":
        return (
          <div className="w-full h-[70vh] bg-zinc-50 p-4 rounded-lg overflow-auto border border-zinc-200">
            <iframe
              src={docUrl}
              className="w-full h-full border-0"
              title={docName}
            />
          </div>
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 bg-zinc-100 text-zinc-400 rounded-2xl flex items-center justify-center mb-4">
              <FileText size={40} />
            </div>
            <p className="text-zinc-600 mb-6">
              Este tipo de arquivo não pode ser visualizado diretamente.
            </p>
            <a
              href={docUrl}
              download={docName}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
            >
              <Download size={20} />
              Baixar Arquivo
            </a>
          </div>
        );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={docName} size="xl">
      <div className="flex flex-col gap-4">
        {renderContent()}
        
        <div className="flex justify-end gap-3 mt-2 pt-4 border-t border-zinc-100">
          <a
            href={docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-100 rounded-lg transition-colors"
          >
            <ExternalLink size={16} />
            Abrir em nova aba
          </a>
          <a
            href={docUrl}
            download={docName}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-zinc-900 text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <Download size={16} />
            Download
          </a>
        </div>
      </div>
    </Modal>
  );
}
