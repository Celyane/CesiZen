<?php

namespace App\Tests\Unit;

use App\Entity\Resource;
use App\Entity\User;
use PHPUnit\Framework\TestCase;

class ResourceTest extends TestCase
{
    private Resource $resource;

    protected function setUp(): void
    {
        $this->resource = new Resource();
    }

    public function testSetAndGetTitle(): void
    {
        $this->resource->setTitle('Test Resource');
        $this->assertSame('Test Resource', $this->resource->getTitle());
    }

    public function testSetAndGetText(): void
    {
        $this->resource->setText('Some content here');
        $this->assertSame('Some content here', $this->resource->getText());
    }

    public function testSetAndGetType(): void
    {
        $this->resource->setType('article');
        $this->assertSame('article', $this->resource->getType());
    }

    public function testVisibleDefaultsTrue(): void
    {
        $this->assertTrue($this->resource->isVisible());
    }

    public function testSetVisible(): void
    {
        $this->resource->setVisible(false);
        $this->assertFalse($this->resource->isVisible());
    }

    public function testSetAndGetImage(): void
    {
        $this->resource->setImage('https://example.com/img.jpg');
        $this->assertSame('https://example.com/img.jpg', $this->resource->getImage());
    }

    public function testImageCanBeNull(): void
    {
        $this->resource->setImage(null);
        $this->assertNull($this->resource->getImage());
    }

    public function testSetAndGetAuthor(): void
    {
        $user = new User();
        $user->setEmail('author@example.com');
        $this->resource->setAuthor($user);
        $this->assertSame($user, $this->resource->getAuthor());
    }

    public function testReadByUsersIsEmptyByDefault(): void
    {
        $this->assertCount(0, $this->resource->getReadByUsers());
    }

    public function testFavoritedByUsersIsEmptyByDefault(): void
    {
        $this->assertCount(0, $this->resource->getFavoritedByUsers());
    }
}
