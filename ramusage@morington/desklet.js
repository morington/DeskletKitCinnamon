const St = imports.gi.St;
const Desklet = imports.ui.desklet;
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;

const uuid = "ramusage@morington";

function RamUsageDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

RamUsageDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);

        this.metadata = metadata;
        this.uuid = this.metadata["uuid"];

        // Основной контейнер с фоном и рамкой
        this._container = new St.BoxLayout({
            vertical: false,
            style_class: "desklet-container",
            style: `
                background-color: #13191c;
                border: 10px solid #243035;
                border-radius: 15px;
                padding: 10px;
            `,
        });

        // Добавляем иконку
        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(`${GLib.get_home_dir()}/.local/share/cinnamon/desklets/${this.uuid}/icons/ram-icon.svg`),
            style_class: "ram-icon",
            icon_size: 64,
        });

        // Разделитель (линия)
        this._separator = new St.DrawingArea({
            style: "background-color: #243035; width: 2px; margin: 0 10px;",
        });
        this._separator.set_height(64);

        // Контейнер для текста с центровкой
        this._textContainer = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: "width: 100px;", // Резервируем ширину
        });

        // Текст для отображения RAM загруженности
        this._ramLabel = new St.Label({
            style: `
                font-size: 30px;
                font-weight: bold;
                color: #ffffff;
                font-family: Monospace; /* Моноширинный шрифт */
                text-align: center;
            `,
            text: "--%",
        });
        
        this._percentRamLabel = new St.Label({
            style: `
                font-size: 10px;
                font-weight: bold;
                color: #ffffff;
                font-family: Monospace; /* Моноширинный шрифт */
                text-align: center;
            `,
            text: "--/--",
        });

        this._textContainer.add(this._ramLabel);
        this._textContainer.add(this._percentRamLabel);

        // Добавляем компоненты в контейнер
        this._container.add(this._icon);
        this._container.add(this._separator);
        this._container.add(this._textContainer);

        this.setContent(this._container);

        // Начинаем обновление данных
        this._updateLoop();
    },

    /**
     * Обновляет данные о загруженности RAM.
     */
    _updateLoop: function () {
        try {
            const [usagePercent, usedRam, totalRam] = this._getRamUsage();

            // Преобразуем значения в гигабайты
            const usedRamGB = ((usedRam / (1024 * 1024 * 1024)) * 1000).toFixed(2); // Округляем до 2 знаков после запятой
            const totalRamGB = ((totalRam / (1024 * 1024 * 1024)) * 1000).toFixed(2); // Округляем до 2 знаков после запятой

            this._ramLabel.set_text(`${usagePercent}%`);
            this._percentRamLabel.set_text(`${usedRamGB}/${totalRamGB} Gb`);
        } catch (e) {
            logError(e);
            this._ramLabel.set_text("Error");
        }

        // Повторяем обновление через 1 секунду
        this._timeout = Mainloop.timeout_add_seconds(1, this._updateLoop.bind(this));
    },

    /**
     * Получает процент загруженности RAM из /proc/meminfo.
     */
    _getRamUsage: function () {
        const file = Gio.File.new_for_path("/proc/meminfo");
        const [, contents] = file.load_contents(null);
        const lines = String(contents).split("\n");

        let totalRam = 0; // Вся память
        let availableRam = 0; // Свободная память

        for (let line of lines) {
            if (line.startsWith("MemTotal:")) {
                totalRam = parseInt(line.split(/\s+/)[1]); // Значение в КБ
            }
            if (line.startsWith("MemAvailable:")) {
                availableRam = parseInt(line.split(/\s+/)[1]); // Значение в КБ
                break; // После нахождения обеих значений можно выходить
            }
        }

        const usedRam = totalRam - availableRam; // Используемая память
        const usagePercent = Math.round((usedRam / totalRam) * 100); // Процент загруженности

        return [usagePercent, usedRam, totalRam];
    },

    /**
     * Очищает ресурсы при удалении десклета.
     */
    on_desklet_removed: function () {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
        }
    },
};

function main(metadata, desklet_id) {
    return new RamUsageDesklet(metadata, desklet_id);
}
