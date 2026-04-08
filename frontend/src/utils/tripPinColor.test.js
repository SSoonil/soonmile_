import { getDefaultTripPinColor, normalizeTripPinColor, TRIP_PIN_COLOR_GROUP_DEFAULT } from './tripPinColor'

describe('trip pin color utils', () => {
  it('returns SOLO default for solo type', () => {
    expect(getDefaultTripPinColor('SOLO')).toBe('#1E7FCD')
  })

  it('normalizes valid hex values', () => {
    expect(normalizeTripPinColor('#ff8b24')).toBe('#FF8B24')
  })

  it('falls back to group default for invalid value', () => {
    expect(normalizeTripPinColor('not-a-color')).toBe(TRIP_PIN_COLOR_GROUP_DEFAULT)
  })
})
