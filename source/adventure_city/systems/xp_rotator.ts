import AL, { PingCompensatedCharacter } from "alclient"
import { Strategist } from "../../strategy_pattern/context.js"
import { BotRecord, BotRegistry, HuntGroupRecord, XPRotationConfig } from "../config/types.js"

export interface XPRotatorState {
    currentSlotIndex: number
    lastRotationTime: number
    killsSinceRotation: number
}

const rotatorStates = new Map<string, XPRotatorState>()

export function initXPRotator(hunt: HuntGroupRecord): XPRotatorState {
    if (!hunt.xpRotation) {
        return { currentSlotIndex: 0, lastRotationTime: Date.now(), killsSinceRotation: 0 }
    }

    const state: XPRotatorState = {
        currentSlotIndex: 0,
        lastRotationTime: Date.now(),
        killsSinceRotation: 0,
    }

    rotatorStates.set(hunt.id, state)
    return state
}

export function getCurrentXPSlot(hunt: HuntGroupRecord): string[] | null {
    if (!hunt.xpRotation) return null

    const state = rotatorStates.get(hunt.id)
    if (!state) return null

    return hunt.xpRotation.slots[state.currentSlotIndex] ?? null
}

export function shouldRotateXP(hunt: HuntGroupRecord, state: XPRotatorState): boolean {
    if (!hunt.xpRotation) return false

    if (hunt.xpRotation.trigger === "kill") {
        return state.killsSinceRotation >= hunt.xpRotation.interval
    }

    if (hunt.xpRotation.trigger === "time") {
        return Date.now() - state.lastRotationTime >= hunt.xpRotation.interval * 1000
    }

    return false
}

export function rotateXP(hunt: HuntGroupRecord, state: XPRotatorState): number {
    if (!hunt.xpRotation) return -1

    state.currentSlotIndex = (state.currentSlotIndex + 1) % hunt.xpRotation.slots.length
    state.lastRotationTime = Date.now()
    state.killsSinceRotation = 0

    console.log(`[XP-ROTATE] Hunt ${hunt.name}: rotated to slot ${state.currentSlotIndex + 1}/${hunt.xpRotation.slots.length}`)
    return state.currentSlotIndex
}

export function recordKill(hunt: HuntGroupRecord, state: XPRotatorState): void {
    if (!hunt.xpRotation) return
    state.killsSinceRotation++
}

export function checkXPRotation(hunt: HuntGroupRecord): boolean {
    if (!hunt.xpRotation) return false

    const state = rotatorStates.get(hunt.id)
    if (!state) return false

    if (shouldRotateXP(hunt, state)) {
        rotateXP(hunt, state)
        return true
    }

    return false
}

export function getAllRotatorStates(): Map<string, XPRotatorState> {
    return rotatorStates
}
