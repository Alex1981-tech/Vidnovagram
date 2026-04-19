import '@testing-library/react'

// happy-dom does not ship URL.createObjectURL / revokeObjectURL.
// Several components under test (AuthMedia, VoicePlayer) call them; stub with no-ops.
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:mock'
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {}
}
