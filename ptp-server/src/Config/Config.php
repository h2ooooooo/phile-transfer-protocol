<?php

/**
 * Configuration class that extends ConfigCore and provides access to various
 * settings such as API credentials and logging options.
 */

namespace jalsoedesign\PhileTransferProtocol\Config;

/**
 *
 */
class Config extends ConfigCore {
    private static ?Config $instance = null;

    public static function instance(): Config {
        if (static::$instance === null) {
            static::$instance = new Config();
        }

        return static::$instance;
    }

    /** @var array */
    protected array $config = [
        'apiUsername' => null,
        'apiPassword' => null,

        'apiRootPath' => null,

        'apiLogPath' => null,
        'apiLogOutputConsole' => null,
        'apiLogHeaders' => null,
        'apiLogBody' => null,

        'ignoreFiles' => [],
    ];

    /**
     * Retrieves the value of the 'apiUsername' configuration as a string.
     *
     * @return string Returns the 'apiUsername' value.
     *
     * @throws \Exception
     */
    public function getApiUsername(): string {
        return $this->requireString('apiUsername');
    }

    /**
     * Retrieves the value of the 'apiPassword' configuration as a string.
     *
     * @return string Returns the 'apiPassword' value from the configuration.
     *
     * @throws \Exception
     */
    public function getApiPassword(): string {
        return $this->requireString('apiPassword');
    }

    /**
     * Retrieves the value of the 'apiRootPath' configuration as a string.
     *
     * @return string Returns the 'apiRootPath' value from the configuration.
     *
     * @throws \Exception
     */
    public function getApiRootPath(): string {
        return $this->requireString('apiRootPath');
    }

    /**
     * Retrieves the value of the 'apiLogPath' configuration as a string or null.
     *
     * @return string|null Returns the 'apiLogPath' value if set, or null if not configured.
     */
    public function getApiLogPath(): string|null {
        return $this->getString('apiLogPath');
    }

    /**
     * Retrieves the value of the 'apiLogOutputConsole' configuration as a boolean.
     *
     * @return bool Returns true if 'apiLogOutputConsole' is enabled, false otherwise.
     */
    public function getApiLogOutputConsole(): bool {
        return $this->getBoolean('apiLogOutputConsole') ?? false;
    }

    /**
     * Retrieves the value of the 'apiLogHeaders' configuration as a boolean.
     *
     * @return bool Returns true if 'apiLogHeaders' is enabled, false otherwise.
     */
    public function getApiLogHeaders(): bool {
        return $this->getBoolean('apiLogHeaders') ?? false;
    }

    /**
     * Retrieves the value of the 'apiLogBody' configuration as a boolean.
     *
     * @return bool Returns true if 'apiLogBody' is enabled, false otherwise.
     */
    public function getApiLogBody(): bool {
        return $this->getBoolean('apiLogBody') ?? false;
    }

    /**
     * Retrieves the value of the 'apiLogBody' configuration as a boolean.
     *
     * @return bool Returns true if 'apiLogBody' is enabled, false otherwise.
     */
    public function getIgnoreFiles(): array {
        return $this->getArray('ignoreFiles') ?? [];
    }

    /**
     * Validates the current configuration instance.
     *
     * @return void
     *
     * @throws \Exception
     */
    public function validate(): void {
        ConfigValidator::validateConfig($this);
    }
}
