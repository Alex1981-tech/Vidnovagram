import { XIcon } from './icons'

interface Props {
  files: File[]
  previews: string[]
  onClear: () => void
}

/** Compact preview strip shown when the file-upload modal is closed but files are still staged. */
export function AttachedPreview({ files, previews, onClear }: Props) {
  if (files.length === 0) return null
  const first = files[0]
  const firstPreview = previews[0]
  const isSingleImage = files.length === 1 && firstPreview && first.type.startsWith('image/')

  return (
    <div className="attached-preview">
      {isSingleImage ? (
        <img src={firstPreview} alt="" className="attached-thumb" />
      ) : (
        <span className="attached-name">
          {files.length === 1 ? first.name : `${files.length} файлів`}
        </span>
      )}
      <button className="attached-remove" onClick={onClear}><XIcon /></button>
    </div>
  )
}
