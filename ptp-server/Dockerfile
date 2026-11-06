FROM php:8.3-apache

COPY src/ /var/www/html/

# Transfer data lives outside the document root so uploaded PHP is never served.
RUN mkdir -p /srv/ptp \
    && chown www-data:www-data /srv/ptp \
    && printf 'ServerName localhost\n' >> /etc/apache2/apache2.conf

EXPOSE 80
