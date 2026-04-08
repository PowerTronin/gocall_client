# Room Speaking Indicator Design

## Summary

Add Discord-like speaking indicators to room tiles in `RoomPage`.

The indicator should be a green outline with a short hold after speech stops so tiles do not flicker.

The speaking source depends on tile type:

- `camera tile` and `voice-only card`: react to the participant's microphone speech activity
- `screen-share tile`: react only to the screen-share audio track, not to the owner's microphone

## Goals

- Show who is actively speaking in the room
- Keep the behavior visually close to Discord
- Apply the indicator consistently in normal grid mode and focus mode
- Distinguish participant speech from screen-share/system-audio activity

## Non-Goals

- No backend changes
- No changes to room voice transport
- No waveform or VU-meter UI

## State Model

`RoomVoiceContext` should expose two short-lived activity states:

- `activeSpeakerIds: string[]`
- `activeScreenShareSpeakerIds: string[]`

Both should use a short hold window so the highlight remains visible briefly after activity stops.

Recommended hold window:

- `1000ms`

## Activity Sources

### Participant Speech

Participant microphone activity should come from LiveKit active-speaker data.

This state applies to:

- camera tiles
- voice-only participant cards

### Screen Share Audio

Screen-share tiles must not inherit the participant's microphone speaking state.

A screen-share tile should be highlighted only when:

- the screen share is publishing its own audio
- and that screen-share audio is currently active

If screen share has no audio track, its tile should never receive the speaking outline.

## UI Behavior

When a tile is considered active:

- apply a green ring
- apply a soft green outer glow

The same visual treatment should work for:

- camera tiles
- voice-only participant cards
- screen-share tiles
- focused tiles
- tiles in the bottom focus strip

## Tile Rules

### Camera Tile

Highlight when the participant is actively speaking on microphone input.

### Voice-Only Card

Highlight when the participant is actively speaking on microphone input.

### Screen-Share Tile

Highlight only when the shared screen audio is active.

Do not highlight the screen-share tile because the owner is talking on microphone.

## Error Handling

- If active-speaker data is unavailable, tiles should fall back to no speaking outline
- Missing screen-share audio must not affect normal screen-share rendering
- Speaking-indicator failures must not affect room voice controls or focus mode

## Testing

Manual verification should cover:

1. A participant talks on microphone and their camera tile gets a green outline
2. A participant with no camera talks and their voice-only card gets a green outline
3. A participant with camera + screen share talks on microphone and only the participant tile is highlighted
4. A participant shares screen audio and the screen-share tile gets a green outline
5. A participant shares screen without audio and the screen-share tile never gets a green outline
6. Speaking indicators remain visible briefly after speech stops
7. The same behavior works in focus mode and in the bottom tile strip
