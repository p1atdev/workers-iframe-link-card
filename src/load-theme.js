// To avoid redeclaration errors
const theme = (() => {
    const localStorageTheme = localStorage?.getItem("theme") ?? "";
    if (["dark", "light"].includes(localStorageTheme)) {
    return localStorageTheme;
    }
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
    }
    return "light";
})();

const setTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.classList.remove("scheme-dark", "scheme-light");
    document.documentElement.classList.add(
        theme === "dark" ? "scheme-dark" : "scheme-light",
    );
    window.localStorage.setItem("theme", theme);
};

// <!-- hue angle -->

// To avoid redeclaration errors
const DEFAULT_HUE = 256;

const applyThemeHue = (angle) => {
    const dataTheme =
    document.documentElement.getAttribute("data-theme") ?? "light";

    const properties = {
    light: {
        background: `oklch(100% 0.01 ${angle}deg)`,
        foreground: `oklch(14.5% 0.05 ${angle}deg)`,
        secondary: `oklch(97% 0.01 ${angle}deg)`,
        border: `oklch(92.2% 0.015 ${angle}deg)`,
        input: `oklch(92.2% 0.015 ${angle}deg)`,
        popover: `oklch(100% 0.01 ${angle}deg)`,
    },
    dark: {
        background: `oklch(20% 0.01 ${angle}deg)`,
        foreground: `oklch(98.5% 0.03 ${angle}deg)`,
        secondary: `oklch(25% 0.01 ${angle}deg)`,
        border: `oklch(25% 0.015 ${angle}deg)`,
        input: `oklch(25% 0.015 ${angle}deg)`,
        popover: `oklch(24% 0.01 ${angle}deg)`,
    },
    };
    if (!Object.keys(properties).includes(dataTheme)) {
    console.warn(
        `Theme "${dataTheme}" not found. Using default properties.`,
    );
    return;
    }

    Object.entries(properties[dataTheme]).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--${key}`, value);
    });
};

const storeHue = (angle) => {
    localStorage.setItem("theme-hue", angle.toString());
};

const getHue = () => {
    const storedHue = localStorage?.getItem("theme-hue");
    return storedHue ? parseFloat(storedHue) : DEFAULT_HUE; // Default to 256 if not set
};

// Initialize the theme hue
const hue = getHue();

// apply theme without flashing
const element = document.documentElement;
element.classList.add("[&_*]:transition-none"); // disable animation

// color theme
document.documentElement.setAttribute("data-theme", theme);
document.documentElement.classList.add(
    theme === "dark" ? "scheme-dark" : "scheme-light",
);
window.localStorage.setItem("theme", theme);

// hue
applyThemeHue(hue);
storeHue(hue); // Store the initial hue if not already set

requestAnimationFrame(() => {
    element.classList.remove("[&_*]:transition-none");
}); // enable animation


// handle messages
window.addEventListener("message", (event) => {
    // TODO: origin check?

    const { type, theme, hue } = event.data;
    if (type === "set-theme" && typeof theme === "string" && typeof hue === "number") {
        // color theme
        setTheme(theme);

        // hue
        applyThemeHue(hue);
        storeHue(hue); // Store the new hue
    }
});