import React from 'react'
import { render, screen } from '@testing-library/react'
import SponsoredBadge from './SponsoredBadge'

describe('SponsoredBadge', () => {
  it('renders sponsored label for assistive tech', () => {
    render(<SponsoredBadge />)
    expect(screen.getByLabelText('제휴 장소')).toBeInTheDocument()
    expect(screen.getByText('제휴')).toBeInTheDocument()
  })
})
