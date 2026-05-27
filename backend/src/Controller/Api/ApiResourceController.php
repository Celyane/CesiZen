<?php

namespace App\Controller\Api;

use App\Entity\Resource;
use App\Entity\User;
use App\Repository\RessourceRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

#[Route('/api/resources')]
class ApiResourceController extends AbstractController
{
    private function serialize(Resource $resource, ?User $currentUser = null): array
    {
        $data = [
            'id' => $resource->getId(),
            'title' => $resource->getTitle(),
            'text' => $resource->getText(),
            'image' => $resource->getImage(),
            'type' => $resource->getType(),
            'visible' => $resource->isVisible(),
            'createdAt' => $resource->getCreatedAt()?->format('Y-m-d H:i:s'),
            'author' => [
                'id' => $resource->getAuthor()->getId(),
                'firstname' => $resource->getAuthor()->getFirstname(),
                'lastname' => $resource->getAuthor()->getLastname(),
            ],
        ];

        if ($currentUser) {
            $data['isRead'] = $resource->getReadByUsers()->contains($currentUser);
            $data['isFavorite'] = $resource->getFavoritedByUsers()->contains($currentUser);
        }

        return $data;
    }

    #[Route('', name: 'api_resource_list', methods: ['GET'])]
    public function list(RessourceRepository $repo): JsonResponse
    {
        $resources = $repo->findBy(['visible' => true], ['createdAt' => 'DESC']);
        /** @var User|null $user */
        $user = $this->getUser();

        return $this->json(array_map(fn($r) => $this->serialize($r, $user), $resources));
    }

    #[Route('/{id}', name: 'api_resource_show', methods: ['GET'])]
    public function show(Resource $resource): JsonResponse
    {
        if (!$resource->isVisible()) {
            return $this->json(['message' => 'Resource not found'], Response::HTTP_NOT_FOUND);
        }

        /** @var User|null $user */
        $user = $this->getUser();
        return $this->json($this->serialize($resource, $user));
    }

    #[Route('', name: 'api_resource_create', methods: ['POST'])]
    #[IsGranted('ROLE_REDACTOR')]
    public function create(Request $request, EntityManagerInterface $em): JsonResponse
    {
        $data = json_decode($request->getContent(), true);

        if (empty($data['title']) || empty($data['text']) || empty($data['type'])) {
            return $this->json(['message' => 'Fields title, text and type are required'], Response::HTTP_BAD_REQUEST);
        }

        /** @var User $user */
        $user = $this->getUser();

        $resource = new Resource();
        $resource->setTitle($data['title']);
        $resource->setText($data['text']);
        $resource->setType($data['type']);
        $resource->setImage($data['image'] ?? null);
        $resource->setVisible($data['visible'] ?? false);
        $resource->setAuthor($user);

        $em->persist($resource);
        $em->flush();

        return $this->json($this->serialize($resource, $user), Response::HTTP_CREATED);
    }

    #[Route('/{id}', name: 'api_resource_update', methods: ['PUT'])]
    #[IsGranted('IS_AUTHENTICATED_FULLY')]
    public function update(Resource $resource, Request $request, EntityManagerInterface $em): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        $isAdmin = in_array('ROLE_ADMIN', $user->getRoles());
        $isAuthor = $resource->getAuthor() === $user;

        if (!$isAdmin && !$isAuthor) {
            return $this->json(['message' => 'Access denied'], Response::HTTP_FORBIDDEN);
        }

        $data = json_decode($request->getContent(), true);

        if (isset($data['title'])) $resource->setTitle($data['title']);
        if (isset($data['text'])) $resource->setText($data['text']);
        if (isset($data['type'])) $resource->setType($data['type']);
        if (array_key_exists('image', $data)) $resource->setImage($data['image']);
        if (isset($data['visible'])) $resource->setVisible($data['visible']);

        $em->flush();

        return $this->json($this->serialize($resource, $user));
    }

    #[Route('/{id}', name: 'api_resource_delete', methods: ['DELETE'])]
    #[IsGranted('IS_AUTHENTICATED_FULLY')]
    public function delete(Resource $resource, EntityManagerInterface $em): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        $isAdmin = in_array('ROLE_ADMIN', $user->getRoles());
        $isAuthor = $resource->getAuthor() === $user;

        if (!$isAdmin && !$isAuthor) {
            return $this->json(['message' => 'Access denied'], Response::HTTP_FORBIDDEN);
        }

        $em->remove($resource);
        $em->flush();

        return $this->json(null, Response::HTTP_NO_CONTENT);
    }

    #[Route('/{id}/read', name: 'api_resource_read', methods: ['POST'])]
    #[IsGranted('IS_AUTHENTICATED_FULLY')]
    public function markRead(Resource $resource, EntityManagerInterface $em): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();
        $user->addReadResource($resource);
        $em->flush();

        return $this->json(['message' => 'Resource marked as read', 'isRead' => true]);
    }

    #[Route('/{id}/favorite', name: 'api_resource_favorite', methods: ['POST'])]
    #[IsGranted('IS_AUTHENTICATED_FULLY')]
    public function toggleFavorite(Resource $resource, EntityManagerInterface $em): JsonResponse
    {
        /** @var User $user */
        $user = $this->getUser();

        if ($user->getFavoriteResources()->contains($resource)) {
            $user->removeFavoriteResource($resource);
            $isFavorite = false;
        } else {
            $user->addFavoriteResource($resource);
            $isFavorite = true;
        }

        $em->flush();

        return $this->json(['isFavorite' => $isFavorite]);
    }
}
