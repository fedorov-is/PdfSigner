# PDF Signer

[Русский](#русский) · [English](#english)

## Русский

Подписывайте PDF-файлы локально в браузере с помощью КриптоПро. Просматривайте документы, добавляйте видимый штамп и скачивайте PDF с отдельным файлом подписи или со встроенной подписью. Интерфейс поддерживает русский и английский языки, светлую и тёмную темы, а также мобильные устройства.

PDF обрабатываются в памяти браузера без загрузки документов на сервер. Просмотр документов и экспорт PDF со штампом доступны без КриптоПро.

### Запуск приложения

Для локального запуска установите Node.js версии 22.13 или новее (рекомендуется 24), затем выполните в каталоге проекта:

```sh
npm ci
npm run dev
```

Откройте в браузере `http://127.0.0.1:5173`. Не закрывайте терминал во время работы с приложением. Если PowerShell в Windows блокирует команду `npm`, используйте `npm.cmd`. Открытие HTML-файла напрямую через `file://` не поддерживается.

### Подготовка к подписанию

Для подписания необходимы:

- КриптоПро CSP.
- Установленный КриптоПро ЭЦП Browser plug-in и его браузерное расширение с разрешённым доступом к сайту приложения.
- Действующий сертификат подписи с доступным закрытым ключом на компьютере или подключённом токене.

Установите компоненты КриптоПро из одобренного вашей организацией источника или от КриптоПро, затем перезапустите браузер. Откройте приложение и нажмите **Проверить КриптоПро**. При запросе разрешите доступ к сайту. Подробности приведены в [заметках об установке и совместимости](docs/release.md).

### Подписание PDF

1. Выберите локальный PDF или перетащите его в приложение. Просмотрите документ с помощью переключения страниц и масштаба.
2. Проверьте готовность КриптоПро и выберите сертификат в списке доступных сертификатов. Проверьте сведения о нём.
3. При необходимости включите видимый штамп, введите подпись к нему, выберите страницу и настройте положение и размер. Можно перетаскивать штамп или использовать числовые поля.
4. Выберите формат результата:
   - **Отдельная подпись (.sig)** — PDF и отдельный файл подписи. Скачайте и храните оба файла вместе: для проверки нужен именно скачанный PDF.
   - **Встроенная подпись (.pdf)** — один PDF-файл со встроенной подписью.
5. Нажмите кнопку подписания PDF и выполните запросы КриптоПро. Вводите PIN-код токена только в системном диалоге КриптоПро.
6. Дождитесь успешной проверки и скачайте готовые файлы. Изменение документа, штампа или сертификата удаляет предыдущие ссылки для скачивания.

Если штамп включён, он добавляется в итоговый PDF до подписания. Для проверки отдельной подписи используйте скачанный PDF и соответствующий файл подписи, а не исходный документ без штампа.

### Экспорт штампа без подписи

Откройте PDF, включите видимый штамп, настройте текст и положение, затем нажмите кнопку экспорта PDF со штампом. КриптоПро для этого не требуется. Сам по себе видимый штамп не является криптографической подписью.

### Поддерживаемые документы и проверка

Размер PDF не должен превышать 20 МиБ, а количество страниц — 500. Документы, защищённые паролем, не поддерживаются. Редактирование и подписание документов с обнаруженными подписями или ограничениями сертификации заблокировано. Встроенная подпись также недоступна для документов XFA.

Перед предоставлением файлов для скачивания приложение проверяет созданные подписи через КриптоПро. Независимая проверка совместимости с программами просмотра PDF и испытания с реальными токенами ещё не завершены. Проверка в приложении не подтверждает доверие к сертификату, статус его отзыва или достоверное время подписания. Перед использованием результата в рабочем процессе проверьте его средством проверки получателя. Текущий статус совместимости описан в [заметках о выпуске](docs/release.md).

### Конфиденциальность

Приложение не сохраняет документы, подписи и сведения о сертификатах в постоянное хранилище. Язык, тема, формат результата и текст штампа сохраняются в хранилище браузера. Закрытые ключи остаются под управлением КриптоПро, приложение не собирает PIN-коды. Компоненты КриптоПро могут обращаться к сетевым службам для проверки сертификатов, поэтому полностью автономное подписание не гарантируется.

### Решение проблем

- **КриптоПро недоступен:** проверьте установку компонентов, браузерное расширение и разрешения сайта, затем повторите проверку КриптоПро.
- **Сертификатов нет в списке:** убедитесь, что сертификат действителен, имеет закрытый ключ, а токен подключён.
- **Ошибка или отмена подписания:** проверьте доступ к ключу и системные диалоги, закройте незавершённые запросы и повторите попытку. При ошибке подписанные файлы не предоставляются.
- **PDF отклонён:** проверьте размер, количество страниц, защиту паролем и наличие существующих подписей с учётом указанных выше ограничений.

### Дополнительная документация

- [Архитектура, план разработки, команды и структура проекта](docs/project.md)
- [Выпуск, установка, развёртывание и совместимость](docs/release.md)
- [Просмотр PDF](docs/preview.md)
- [Видимые штампы](docs/stamp.md)
- [Отдельные подписи](docs/detached.md)
- [Встроенные подписи](docs/embedded.md)

---

﻿# PDF Signer

Sign PDF files locally in your browser using CryptoPro. Preview documents, add an optional visible stamp, and download either a PDF with a separate signature or a PDF with an embedded signature. The interface supports English and Russian, light and dark themes, and mobile layouts.

PDFs are processed in browser memory without document uploads or an application backend. Previewing documents and exporting visible stamps work without CryptoPro.

### Start the application

To run a local copy, install Node.js 22.13 or newer (24 recommended), then run these commands from the project directory:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173` in your browser. Keep the terminal running while using the app. On Windows, use `npm.cmd` instead of `npm` if PowerShell blocks the command. Opening the HTML file directly with `file://` is not supported.

### Prepare for signing

Signing requires:

- CryptoPro CSP.
- The native CryptoPro Browser plug-in and its browser extension, enabled for the application site.
- A currently valid signing certificate with its private key available on your computer or connected token.

Install CryptoPro components from your organization's approved source or CryptoPro, then restart the browser. Open the app and select **Check CryptoPro** to check readiness. Allow site access if prompted. See [installation and compatibility notes](docs/release.md) for details.

### Sign a PDF

1. Select a local PDF or drag it into the application. Review its pages using the page and zoom controls.
2. Check CryptoPro readiness and choose a certificate from **Available certificates**. Review the certificate details.
3. Optionally enable **Add visible stamp**, enter a caption, choose its page, and drag or resize it. Numeric position and size controls are also available.
4. Choose an **Output format**:
   - **Separate signature (.sig)** produces a PDF and a separate signature file. Download and keep both files together; verification requires the exact downloaded PDF.
   - **Embedded signature (.pdf)** produces a single signed PDF.
5. Select **Sign PDF** and complete any native CryptoPro prompts. Enter a token PIN only in CryptoPro's native dialog.
6. Wait for successful verification, then download the generated files. Changing the document, stamp, or certificate clears previous download links.

When a stamp is enabled, signing includes it in the final PDF. In separate-signature mode, use the downloaded PDF with its matching signature, rather than the original unstamped document.

### Export a stamp without signing

Open a PDF, enable **Add visible stamp**, adjust its text and placement, then select **Export stamped PDF**. CryptoPro is not required. A visible stamp alone is not a cryptographic signature.

### Supported documents and verification

PDFs must be no larger than 20 MiB and contain at most 500 pages. Password-protected PDFs are not supported. Editing or signing documents with detected existing signatures or certification restrictions is blocked; embedded signing also rejects XFA documents.

The app verifies generated signatures through CryptoPro before offering downloads. Independent reader compatibility and real-token acceptance checks remain pending. This verification does not establish certificate trust, revocation status, or a trusted signing time. Before using signed output in a required workflow, check it with the recipient's verifier. See the [release notes](docs/release.md) for the current compatibility status.

### Privacy

Documents, signatures, and certificate details are not persisted by the app. Preferences, including language, theme, output format, and the stamp caption, are saved in browser storage. Private keys remain under CryptoPro's control, and the app does not collect PINs. Native CryptoPro components may access network services for certificate validation, so fully offline signing is not guaranteed.

### Troubleshooting

- **CryptoPro is unavailable:** check the native installation, browser extension, and site permissions, then select **Check CryptoPro** again.
- **No certificate is listed:** ensure the certificate is valid, has a private key, and its token is connected.
- **Signing fails or is cancelled:** check key access and native dialogs, dismiss any pending prompts, and retry. Failed operations do not provide signed output.
- **The PDF is rejected:** check the file size, page count, encryption, and existing signatures against the limits above.

### Further documentation

- [Project design, implementation roadmap, development commands, and layout](docs/project.md)
- [Release, installation, deployment, and compatibility](docs/release.md)
- [PDF preview](docs/preview.md)
- [Visible stamps](docs/stamp.md)
- [Separate signatures](docs/detached.md)
- [Embedded signatures](docs/embedded.md)
