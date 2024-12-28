const St = imports.gi.St;
const Desklet = imports.ui.desklet;
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;

const uuid = "diskusage@morington";

function DiskUsageDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

DiskUsageDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);

        this.metadata = metadata;
        this.uuid = this.metadata["uuid"];

        // Основной контейнер десклета
        this._container = new St.BoxLayout({
            vertical: true,
            style_class: "desklet-container",
            style: `
                background-color: #243035;
                border-radius: 15px;
                padding: 10px;
            `,
        });

        // Верхний блок с оставшимся местом
        this._spaceContainer = new St.BoxLayout({
            vertical: false,
            style: `
                background-color: #13191c;
                border-radius: 10px;
                padding: 10px;
                margin-bottom: 10px;
            `,
        });

        this._icon = new St.Icon({
            gicon: Gio.icon_new_for_string(`${GLib.get_home_dir()}/.local/share/cinnamon/desklets/${this.uuid}/icons/disk-icon.svg`),
            icon_size: 64,
        });

        // Разделитель (линия)
        this._separator = new St.DrawingArea({
            style: "background-color: #243035; width: 2px; margin: 0 10px;",
        });
        this._separator.set_height(64);

        // Контейнер для текста с центровкой
        this._textContainer = new St.BoxLayout({
            vertical: true, // Горизонтальный контейнер становится вертикальным
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style: "width: 100px;", // Резервируем ширину
        });

        // Текст для отображения процента заполнения
        this._percentLabel = new St.Label({
            style: `
                font-size: 30px;
                font-weight: bold;
                color: #ffffff;
                font-family: Monospace;
                text-align: center;
                margin-bottom: 2px;
            `,
            text: "--%",
        });

        // Текст для отображения оставшегося места
        this._spaceLabel = new St.Label({
            style: `
                font-size: 10px;
                font-weight: bold;
                color: #ffffff;
                font-family: Monospace;
                text-align: center;
            `,
            text: "--GB",
        });

        // Добавляем оба текста в контейнер
        this._textContainer.add(this._percentLabel);
        this._textContainer.add(this._spaceLabel);

        this._spaceContainer.add(this._icon);
        this._spaceContainer.add(this._separator);
        this._spaceContainer.add(this._textContainer);
        this._container.add(this._spaceContainer);

        // Список ссылок
        const folders = [
            { name: "Downloads", color: "#ffd45e", icon: "folder-icon.svg" },
            { name: "Documents", color: "#6bff5e", icon: "folder-icon.svg" },
            { name: "Music", color: "#5e8cff", icon: "folder-icon.svg" },
            { name: "Pictures", color: "#af5eff", icon: "folder-icon.svg" },
            { name: ".local", color: "#ff5e5e", icon: "folder-icon.svg" },
        ];

        this._linksContainer = new St.BoxLayout({
            vertical: true,
        });

        folders.forEach(folder => {
            // Основной контейнер для ссылки
            const folderContainer = new St.BoxLayout({
                vertical: false,
                x_expand: true, // Позволяет контейнеру растягиваться на всю ширину
                x_align: Clutter.ActorAlign.START, // Выравнивание по левому краю
                style: "margin-bottom: 5px;",
            });
        
            // Иконка папки
            const icon = new St.Icon({
                gicon: Gio.icon_new_for_string(`${GLib.get_home_dir()}/.local/share/cinnamon/desklets/${this.uuid}/icons/${folder.icon}`),
                icon_size: 32,
            });

            const _folderNameContainer = new St.BoxLayout({
                vertical: true, // Горизонтальный контейнер становится вертикальным
                x_align: Clutter.ActorAlign.CENTER,
                y_align: Clutter.ActorAlign.CENTER,
            });
        
            // Название папки
            const linkLabel = new St.Label({
                style: `
                    font-size: 16px;
                    color: ${folder.color};
                    font-family: Monospace;
                `,
                text: folder.name,
                x_expand: true, // Расширение по ширине, чтобы избежать центровки
            });
            _folderNameContainer.add(linkLabel);

            // Кнопка для кликов
            const folderButton = new St.Button({
                child: _folderNameContainer,
                x_expand: true
            });
        
            // Контейнер для иконки и текста
            const iconTextContainer = new St.BoxLayout({
                vertical: false,
                x_expand: true,
                x_align: Clutter.ActorAlign.START, // Выравнивание по левому краю
            });
        
            iconTextContainer.add(icon);
            iconTextContainer.add(new St.Label({ text: "   " })); // Пробел между иконкой и текстом
            iconTextContainer.add(folderButton);

            folderContainer.add(iconTextContainer);
        
            // Добавляем обработчик клика
            folderButton.connect("clicked", () => {
                const folderPath = `${GLib.get_home_dir()}/${folder.name}`;
                global.log(`Opening folder: ${folderPath}`);
                try {
                    Gio.AppInfo.launch_default_for_uri(`file://${folderPath}`, null);
                } catch (e) {
                    logError(`Не удалось открыть папку: ${folderPath}`);
                }
            });
        
            // Добавляем кнопку в общий контейнер
            this._linksContainer.add(folderContainer);
        });

        this._container.add(this._linksContainer);

        this.setContent(this._container);

        // Начинаем обновление данных
        this._updateDiskSpace();
    },

    /**
     * Получает данные о свободном и общем месте в корневом разделе (/)
     * с помощью команды df.
     * @returns {Promise<[number, number]>} Используемое место и общий объём в ГБ.
     */
    _getDiskSpace: function () {
        return new Promise((resolve, reject) => {
            try {
                const subprocess = new Gio.Subprocess({
                    argv: ['/bin/df', '/'],
                    flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
                });
                subprocess.init(null);

                subprocess.communicate_utf8_async(null, null, (obj, res) => {
                    try {
                        const [ok, stdout, stderr] = obj.communicate_utf8_finish(res);
                        if (!ok) throw new Error(stderr);

                        const lines = stdout.split('\n');
                        const data = lines[1].split(/\s+/); // Парсим вторую строку результата команды df

                        const totalSpaceGB = parseFloat(data[1]) / 1024 / 1024; // Всего в ГБ
                        const freeSpaceGB = parseFloat(data[3]) / 1024 / 1024;  // Доступно в ГБ

                        resolve([totalSpaceGB, freeSpaceGB]);
                    } catch (e) {
                        reject(e);
                    }
                });
            } catch (e) {
                reject(e);
            }
        });
    },

    /**
     * Обновляет данные о свободном месте на диске.
     */
    _updateDiskSpace: function () {
        this._getDiskSpace()
            .then(([totalSpaceGB, freeSpaceGB]) => {
                const usedSpaceGB = totalSpaceGB - freeSpaceGB;
                const percentUsed = Math.round((usedSpaceGB / totalSpaceGB) * 100);
    
                // Обновляем оба текста
                this._percentLabel.set_text(`${percentUsed}%`);
                this._spaceLabel.set_text(`Free: ${freeSpaceGB.toFixed(1)} GB`);
            })
            .catch((e) => {
                logError(e);
                this._percentLabel.set_text("Error");
                this._spaceLabel.set_text("Error");
            });
    
        // Обновление данных каждые 30 секунд
        this._timeout = Mainloop.timeout_add_seconds(30, this._updateDiskSpace.bind(this));
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
    return new DiskUsageDesklet(metadata, desklet_id);
}
