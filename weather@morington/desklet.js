const St = imports.gi.St;
const Desklet = imports.ui.desklet;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Soup = imports.gi.Soup;
const ByteArray = imports.byteArray;
const Mainloop = imports.mainloop;

const UUID = "weather@morington";
const API_KEY = "bd5e378503939ddaee76f12ad7a97608"; // Ваш API-ключ
const LAT = 53.2001;
const LON = 50.15;
const UPDATE_INTERVAL = 30 * 60; // Обновление каждые 30 минут

function WeatherDesklet(metadata, desklet_id) {
    this._init(metadata, desklet_id);
}

WeatherDesklet.prototype = {
    __proto__: Desklet.Desklet.prototype,

    _init: function (metadata, desklet_id) {
        Desklet.Desklet.prototype._init.call(this, metadata, desklet_id);

        this.metadata = metadata;
        this.uuid = UUID;

        // Создаем HTTP-сессию
        this._httpSession = new Soup.Session();
        if (Soup.MAJOR_VERSION >= 3) {
            this._httpSession.timeout = 10;
        }

        // Основной контейнер
        this._container = new St.BoxLayout({
            vertical: true,
            style_class: "desklet-container",
            style: `
                background-color: #13191c;
                border: 10px solid #243035;
                border-radius: 15px;
                padding: 10px;
            `,
        });

        this._topRow = new St.BoxLayout({ vertical: false });

        this._weatherIcon = new St.Icon({
            icon_size: 64,
            style: "margin-right: 10px;",
        });

        this._infoBox = new St.BoxLayout({
            vertical: true
        });

        this._weatherLabel = new St.Label({
            style: `
                color: #ffffff;
                font-size: 25px;
                font-weight: bold;
                width: 180px;
            `,
            text: "Загрузка погоды...",
        });

        this._feelsLikeLabel = new St.Label({ style: "color: #ffffff;", text: "" });
        this._humidityLabel = new St.Label({ style: "color: #ffffff;", text: "" });
        this._pressureLabel = new St.Label({ style: "color: #ffffff;", text: "" });
        this._windLabel = new St.Label({ style: "color: #ffffff;", text: "" });
        this._lastUpdated = new St.Label({ style: "color: #2c3a41; padding-top: 3px;", text: "" });

        this._infoBox.add(this._weatherLabel);
        this._infoBox.add(this._feelsLikeLabel);
        this._infoBox.add(this._humidityLabel);
        this._infoBox.add(this._pressureLabel);
        this._infoBox.add(this._windLabel);
        this._infoBox.add(this._lastUpdated);

        this._topRow.add(this._weatherIcon);
        this._topRow.add(this._infoBox);

        this._container.add(this._topRow);
        this.setContent(this._container);

        // Старт обновления погоды
        this._updateWeather();
    },

    /**
     * Выполняет запрос к API OpenWeather.
     */
    _getWeather: function (url, callback, params, userAgent) {
        var here = this;

        if (params) {
            let glib_str_url = new GLib.String(url + '?');
            for (const [key, value] of Object.entries(params)) {
                Soup.header_g_string_append_param(glib_str_url, key, value + '&');
            }
            url = glib_str_url.str.replace(/['"']/g, '');
            url = url.replace(/\&$/, '');
        }

        let message = Soup.Message.new('GET', url);

        if (Soup.MAJOR_VERSION === undefined || Soup.MAJOR_VERSION === 2) {
            if (userAgent) this._httpSession.user_agent = userAgent;
            this._httpSession.queue_message(message, function (session, message) {
                if (message.status_code === 200) {
                    try {
                        callback.call(here, message.response_body.data.toString());
                    } catch (e) {
                        global.logError(e);
                    }
                } else {
                    global.logWarning(
                        'Error retrieving address ' + url + '. Status: ' + message.status_code + ': ' + message.reason_phrase
                    );
                    callback.call(here, false);
                }
            });
        } else {
            if (userAgent) this._httpSession.user_agent = userAgent;
            this._httpSession.send_and_read_async(message, Soup.MessagePriority.NORMAL, null, function (session, result) {
                if (message.get_status() === 200) {
                    try {
                        const bytes = here._httpSession.send_and_read_finish(result);
                        callback.call(here, ByteArray.toString(bytes.get_data()));
                    } catch (e) {
                        global.logError(e);
                    }
                } else {
                    global.logWarning(
                        'Error retrieving address ' + url + '. Status: ' + message.get_status() + ': ' + message.get_reason_phrase()
                    );
                    callback.call(here, false);
                }
            });
        }
    },

    /**
     * Обновляет данные о погоде.
     */
    _updateWeather: function () {
        global.log(`[WeatherDesklet] Starting weather update...`);

        const apiURL = `https://api.openweathermap.org/data/2.5/weather`;
        const params = {
            lat: LAT,
            lon: LON,
            units: 'metric',
            appid: API_KEY,
            lang: 'ru'
        };

        this._getWeather(
            apiURL,
            function (data) {
                if (data) {
                    try {
                        const weatherData = JSON.parse(data);
                        this._processWeatherData(weatherData);
                    } catch (e) {
                        global.logError(`[WeatherDesklet] Failed to parse weather data: ${e}`);
                    }
                } else {
                    global.logWarning(`[WeatherDesklet] Weather data retrieval failed.`);
                }
            },
            params
        );

        // Планируем следующее обновление через UPDATE_INTERVAL секунд
        if (this._timeout) Mainloop.source_remove(this._timeout);
        this._timeout = Mainloop.timeout_add_seconds(UPDATE_INTERVAL, this._updateWeather.bind(this));
    },

    /**
     * Обрабатывает данные погоды.
     */
    _processWeatherData: function (data) {
        global.log(`[WeatherDesklet] Processing weather data...`);

        const weather = data.weather[0];
        const main = data.main;
        const wind = data.wind;

        const description = weather.description;
        const temp = main.temp.toFixed(1);
        const feelsLike = main.feels_like.toFixed(1);
        const humidity = main.humidity;
        const pressure = (main.pressure * 0.750062).toFixed(1); // ГПа -> мм рт. ст.
        const windSpeed = wind.speed.toFixed(1);

        // Обновляем виджет
        const _icon = Gio.icon_new_for_string(`${GLib.get_home_dir()}/.local/share/cinnamon/desklets/${this.uuid}/icons/weather/${weather.icon}.svg`)
        this._weatherIcon.set_gicon(_icon);
        this._weatherLabel.set_text(`${temp}°C`);
        this._feelsLikeLabel.set_text(`Ощущается: ${feelsLike}°C`);
        this._humidityLabel.set_text(`Влажность: ${humidity}%`);
        this._pressureLabel.set_text(`Давление: ${pressure} мм. рт. с.`);
        this._windLabel.set_text(`Ветер: ${windSpeed} m/s`);
        
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        const dayOfMonth = now.getDate();
        const month = now.getMonth();
        const year = now.getFullYear();

        this._lastUpdated.set_text(`${hours}:${minutes}:${seconds}  ${dayOfMonth}.${month}.${year}`);
    },

    /**
     * Очистка при удалении десклета.
     */
    on_desklet_removed: function () {
        if (this._timeout) Mainloop.source_remove(this._timeout);
        global.log(`[WeatherDesklet] Desklet removed.`);
    },
};

function main(metadata, desklet_id) {
    return new WeatherDesklet(metadata, desklet_id);
}
