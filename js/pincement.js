// Two-finger pinch maths for the viewer. No DOM here, so it can be tested under Node.

// Spread and middle point of two touches ({ clientX, clientY })
export function mesurer(a, b) {
    return {
        distance: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
        centre: { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 }
    };
}

// Zoom once the fingers went from `distanceDepart` to `distanceFin` apart
export function zoomApresPincement(zoom, distanceDepart, distanceFin, min, max) {
    if (distanceDepart <= 0) return zoom;
    return Math.min(max, Math.max(min, zoom * (distanceFin / distanceDepart)));
}

// Scroll offset that keeps a content point (`position` px from the content start)
// under the fingers (`ecran` px from the viewport edge) after scaling by `facteur`
export function defilementAncre(position, facteur, ecran) {
    return Math.max(0, position * facteur - ecran);
}
