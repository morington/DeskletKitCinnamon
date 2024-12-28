const St = imports.gi.St;
const Desklet = imports.ui.desklet;
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;

const uuid = "time@morington";

function TimeDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

TimeDesklet.prototype = {
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
            gicon: Gio.icon_new_for_string(`${GLib.get_home_dir()}/.local/share/cinnamon/desklets/${this.uuid}/icons/clock-icon.svg`),
            style_class: "clock-icon",
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
            style: "width: 170px;", // Резервируем ширину под 4 символа
        });

        // Текст для отображения времени
        this._timeLabel = new St.Label({
            style: `
                font-size: 30px;
                font-weight: bold;
                color: #ffffff;
                font-family: Monospace; /* Моноширинный шрифт */
                text-align: center;
            `,
            text: "--:--:--",
        });

        // Текст для отображения даты
        this._dateLabel = new St.Label({
            style: `
                font-size: 10px;
                font-weight: bold;
                color: #ffffff;
                font-family: Monospace; /* Моноширинный шрифт */
                text-align: center;
            `,
            text: "-",
        });
        this._textContainer.add(this._timeLabel);
        this._textContainer.add(this._dateLabel);

        // Добавляем компоненты в контейнер
        this._container.add(this._icon);
        this._container.add(this._separator);
        this._container.add(this._textContainer);

        this.setContent(this._container);

        // Начинаем обновление времени
        this._updateTime();
    },

    /**
     * Обновляет отображение времени.
     */
    _updateTime: function () {
        try {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            this._timeLabel.set_text(`${hours}:${minutes}:${seconds}`);

            // Форматируем дату
            const daysOfWeek = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
            const months = [
                "января", "февраля", "марта", "апреля", "мая", "июня",
                "июля", "августа", "сентября", "октября", "ноября", "декабря"
            ];
            const dayOfWeek = daysOfWeek[now.getDay()];
            const dayOfMonth = now.getDate();
            const month = months[now.getMonth()];
            const year = now.getFullYear();
            this._dateLabel.set_text(`${dayOfWeek} ${dayOfMonth} ${month} ${year}`);
        } catch (e) {
            logError(e);
            this._timeLabel.set_text("Error");
            this._dateLabel.set_text("Error");
        }

        // Повторяем обновление через 1 секунду
        this._timeout = Mainloop.timeout_add_seconds(1, this._updateTime.bind(this));
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
    return new TimeDesklet(metadata, desklet_id);
}