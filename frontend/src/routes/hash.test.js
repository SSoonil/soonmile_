import { getInviteCodeFromHash, getRouteFromHash, getTripIdFromHash, getTripShareTokenFromHash } from './hash'

describe('hash routing helpers', () => {
  it('parses trip-detail route and tripId', () => {
    window.location.hash = '#trip-detail/trip-123'
    expect(getRouteFromHash()).toBe('trip-detail')
    expect(getTripIdFromHash()).toBe('trip-123')
  })

  it('parses invite route and invite code', () => {
    window.location.hash = '#invite/ABC123'
    expect(getRouteFromHash()).toBe('invite')
    expect(getInviteCodeFromHash()).toBe('ABC123')
  })

  it('parses trip-share route and token', () => {
    window.location.hash = '#trip-share/share-token-xyz'
    expect(getRouteFromHash()).toBe('trip-share')
    expect(getTripShareTokenFromHash()).toBe('share-token-xyz')
  })

  it('falls back to home route on unknown hash', () => {
    window.location.hash = '#unknown-page'
    expect(getRouteFromHash()).toBe('home')
  })
})
