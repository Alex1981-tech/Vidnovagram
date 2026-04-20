interface Props {
  date: string
}

/** Horizontal date pill between messages. */
export function DateSeparator({ date }: Props) {
  return (
    <div className="date-separator">
      <span>{date}</span>
    </div>
  )
}
