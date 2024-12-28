const St = imports.gi.St;
const Desklet = imports.ui.desklet;
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;

const uuid = "cpuusage@morington";

function TestDiskDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

TestDiskDesklet.prototype = {
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
            gicon: Gio.icon_new_for_string(`${GLib.get_home_dir()}/.local/share/cinnamon/desklets/${this.uuid}/icons/cpu-icon.svg`),
            style_class: "cpu-icon",
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
            style: "width: 100px;", // Резервируем ширину под 4 символа
        });

        // Текст для отображения CPU загрузки
        this._cpuLabel = new St.Label({
            style: `
                font-size: 30px;
                font-weight: bold;
                color: #ffffff;
                font-family: Monospace; /* Моноширинный шрифт */
                text-align: center;
            `,
            text: "---%",
        });

        // Текст для отображения температуры CPU
        this._cpuTemperatureLabel = new St.Label({
            style: `
                font-size: 10px;
                font-weight: bold;
                color: #ffffff;
                font-family: Monospace; /* Моноширинный шрифт */
                text-align: center;
            `,
            text: "---%",
        });
        this._textContainer.add(this._cpuLabel);
        this._textContainer.add(this._cpuTemperatureLabel);

        // Добавляем компоненты в контейнер
        this._container.add(this._icon);
        this._container.add(this._separator);
        this._container.add(this._textContainer);

        this.setContent(this._container);

        // Переменные для расчёта загруженности CPU
        this._previousActive = 0;
        this._previousTotal = 0;

        // Начинаем обновление данных
        this._updateLoop();
    },

    /**
     * Обновляет данные о загруженности CPU.
     */
    _updateLoop: function () {
        try {
            const [activeTime, totalTime] = this._getCpuTimes();
            if (this._previousTotal > 0) {
                const deltaActive = activeTime - this._previousActive;
                const deltaTotal = totalTime - this._previousTotal;

                const usage = Math.round((deltaActive / deltaTotal) * 100);
                this._cpuLabel.set_text(`${usage}%`);
            }

            const [result, out] = GLib.spawn_command_line_sync("cat /sys/class/thermal/thermal_zone2/temp");

            if (!result || out === null) {
                throw new Error("Failed to get the processor temperature.");
            }

            let temperature = parseFloat(out.toString().trim()) / 1000.0;

            const temperatureText = `${temperature.toFixed(1)}°C`;
            this._cpuTemperatureLabel.set_text(temperatureText);

            this._previousActive = activeTime;
            this._previousTotal = totalTime;
        } catch (e) {
            logError(e);
            this._cpuLabel.set_text("Error");
        }

        // Повторяем обновление через 1 секунду
        this._timeout = Mainloop.timeout_add_seconds(1, this._updateLoop.bind(this));
    },

    /**
     * Получает активное и общее время CPU из /proc/stat.
     */
    _getCpuTimes: function () {
        const file = Gio.File.new_for_path("/proc/stat");
        const [, contents] = file.load_contents(null);
        const lines = String(contents).split("\n");

        const cpuLine = lines[0]; // Первая строка — общие данные CPU
        const values = cpuLine.split(/\s+/).slice(1, 8).map(v => parseInt(v, 10));

        const activeTime = values[0] + values[1] + values[2]; // user + nice + system
        const totalTime = values.reduce((a, b) => a + b, 0);  // сумма всех значений

        return [activeTime, totalTime];
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
    return new TestDiskDesklet(metadata, desklet_id);
}
